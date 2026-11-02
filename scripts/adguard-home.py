#!/usr/bin/env python3
"""Prepara e configura AdGuard Home; não altera DNS do host."""
import argparse
import base64
import ipaddress
import http.client
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

STATE = Path.home() / '.local/state/casalocal/adguard'
IMAGE = 'adguard/adguardhome:v0.107.79@sha256:aba9e3bf0613be3ba3755e1fc311b126e2c24bec25e18b6483894a88283074f0'
UPSTREAMS = ['https://dns.quad9.net/dns-query', '[/tail634fb2.ts.net/ts.net/]100.100.100.100', '[/home/]192.168.15.1']


def private_file(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(value)


def prepare(lan):
    address = ipaddress.ip_address(lan)
    if address.version != 4 or not address.is_private or address.is_loopback or address.is_unspecified:
        raise ValueError('LAN deve ser IPv4 privado não-loopback')
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    if STATE.is_symlink() or STATE.stat().st_uid != os.getuid():
        raise ValueError('diretório privado inválido')
    os.chmod(STATE, 0o700)
    for name in ('conf', 'work'):
        path = STATE / name
        path.mkdir(mode=0o700, exist_ok=True)
        if path.is_symlink() or path.stat().st_uid != os.getuid():
            raise ValueError('diretório de dados inválido')
        os.chmod(path, 0o700)
    admin, compose_path = STATE / 'admin.json', STATE / 'compose.json'
    for path in (admin, compose_path):
        if path.exists() or path.is_symlink():
            if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
                raise ValueError('estado ou permissões inseguras; não sobrescrito')
    if compose_path.exists():
        if not admin.exists():
            raise ValueError('compose sem credencial; não sobrescrito')
        print('Estado privado já existe; preservado. Confira bind LAN no Compose.')
        return
    if not admin.exists() and (STATE / 'conf/AdGuardHome.yaml').exists():
        raise ValueError('configuração existente sem credencial; não sobrescrita')
    found = subprocess.run(['docker', 'inspect', '--format', '{{.Name}}', 'casalocal-adguard'], capture_output=True, text=True, timeout=5)
    if found.returncode == 0:
        print('Contêiner existente detectado; não será recriado nem modificado.')
    else:
        print('Contêiner não confirmado; verifique Docker antes de executar Compose.')
    compose = {'services': {'adguard': {'image': IMAGE, 'container_name': 'casalocal-adguard',
        'restart': 'unless-stopped', 'mem_limit': '256m', 'cpus': 1,
        'logging': {'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '2'}}, 'ports': [f'{ip}:53:53/{proto}' for ip in ('127.0.0.1', lan) for proto in ('tcp', 'udp')] +
        ['127.0.0.1:3000:3000/tcp', '127.0.0.1:3080:80/tcp'],
        'volumes': [f'{STATE}/work:/opt/adguardhome/work', f'{STATE}/conf:/opt/adguardhome/conf']}}}
    if not admin.exists():
        private_file(admin, json.dumps({'username': 'admin', 'password': secrets.token_urlsafe(32)}))
    private_file(STATE / 'compose.json', json.dumps(compose, indent=2) + '\n')
    print('Compose e credencial privados criados; confira DNS LAN e portas antes de iniciar.')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(port, path, data=None, auth=False):
    headers = {}
    if auth:
        credential_path = STATE / 'admin.json'
        if credential_path.is_symlink() or credential_path.stat().st_uid != os.getuid() or credential_path.stat().st_mode & 0o077:
            raise ValueError('permissões da credencial não são privadas')
        cred = json.loads(credential_path.read_text())
        token = base64.b64encode((cred['username'] + ':' + cred['password']).encode()).decode()
        headers['Authorization'] = 'Basic ' + token
    body = None if data is None else json.dumps(data).encode()
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(f'http://127.0.0.1:{port}/control/{path}', data=body, headers=headers)
    with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(req, timeout=10) as resp:
        raw = resp.read()
    return json.loads(raw) if raw and raw.lstrip().startswith((b'{', b'[')) else {}


def configure():
    path = STATE / 'admin.json'
    if path.is_symlink() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise ValueError('permissões da credencial não são privadas')
    config = STATE / 'conf/AdGuardHome.yaml'
    try:
        status = request(3080, 'status', auth=True)
    except urllib.error.HTTPError as exc:
        if exc.code != 301 or exc.headers.get('Location') not in ('/install.html', '/install.html/'):
            raise
        exc.close()
    except urllib.error.URLError as exc:
        if not isinstance(exc.reason, (ConnectionRefusedError, ConnectionResetError, http.client.RemoteDisconnected)):
            raise
    except (ConnectionResetError, http.client.RemoteDisconnected):
        pass
    else:
        if not status.get('version'):
            raise ValueError('resposta de status não identificada; wizard não reiniciado')
        print('AdGuard já configurado; configurações preservadas.')
        return
    if config.exists() or config.is_symlink():
        raise ValueError('configuração existente e API indisponível; wizard não reiniciado')
    wizard = request(3000, 'install/get_addresses')
    if not (wizard.get('version') and isinstance(wizard.get('interfaces'), dict)
            and isinstance(wizard.get('dns_port'), int) and isinstance(wizard.get('web_port'), int)):
        raise ValueError('wizard não comprovado; configuração cancelada')
    if config.exists() or config.is_symlink():
        raise ValueError('configuração criada durante verificação; wizard não reiniciado')
    cred = json.loads(path.read_text())
    request(3000, 'install/configure', {'web': {'ip': '0.0.0.0', 'port': 80},
        'dns': {'ip': '0.0.0.0', 'port': 53}, 'username': cred['username'], 'password': cred['password'], 'language': 'pt-br'})
    config = STATE / 'conf/AdGuardHome.yaml'
    if config.is_file() and not config.is_symlink():
        if config.stat().st_mode & 0o777 != 0o600:
            os.chmod(config, 0o600)
    else:
        raise ValueError('configuração não encontrada; verificar permissões e estado')
    print('Configuração inicial enviada. Execute upstreams após a UI final responder.')


def upstreams(values):
    compose_path = STATE / 'compose.json'
    if compose_path.is_symlink() or not compose_path.is_file():
        raise ValueError('compose ausente ou inseguro; bind DNS desconhecido')
    compose = json.loads(compose_path.read_text())
    ports = compose['services']['adguard']['ports']
    bound = set()
    for port in ports:
        if not isinstance(port, str):
            raise ValueError('bind DNS não reconhecido')
        parts = port.rsplit(':', 2)
        if len(parts) == 3 and parts[1] == '53' and parts[2].split('/')[0] == '53':
            ip = ipaddress.ip_address(parts[0].strip('[]'))
            bound.add(getattr(ip, 'ipv4_mapped', None) or ip)
    if not bound:
        raise ValueError('bind DNS ausente')
    for value in values:
        address = value
        if address.startswith('[/'):
            if ']' not in address:
                raise ValueError('upstream condicional inválido')
            address = address.split(']', 1)[1]
        parsed = urlsplit(address if '://' in address else 'dns://' + address)
        host = parsed.hostname
        if not host or host.lower().rstrip('.') == 'localhost':
            raise ValueError('upstream inválido ou local')
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            continue  # Nomes e loops indiretos exigem verificação operacional.
        ip = getattr(ip, 'ipv4_mapped', None) or ip
        if ip.is_loopback or ip.is_unspecified or ip in bound:
            raise ValueError('upstream pode causar loop')
    dhcp = request(3080, 'dhcp/status', auth=True)
    if dhcp.get('enabled') is not False:
        raise ValueError('DHCP não está comprovadamente desativado')
    request(3080, 'dns_config', {'upstream_dns': values}, auth=True)
    result = request(3080, 'dns_info', auth=True)
    if result.get('upstream_dns') != values:
        raise ValueError('upstreams retornados não coincidem; não alterar DNS do cliente')
    print('Upstreams configurados; verifique alcance DNS condicional antes de integrar o cliente.')


def verify(allow, block):
    if shutil.which('dig') is None:
        raise ValueError('dig ausente: instale a ferramenta ou use outro cliente DNS')
    for name, blocked in ((allow, False), (block, True)):
        if not name or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-' for c in name):
            raise ValueError('domínio inválido')
        data = request(3080, 'filtering/check_host?name=' + name + '&qtype=A', auth=True)
        if bool(data.get('reason', '').startswith('Filtered')) != blocked:
            raise ValueError('resultado de filtragem inesperado: ' + name)
        for proto in ('udp', 'tcp'):
            args = ['dig', '@127.0.0.1', name, 'A', '+time=3', '+tries=1', '+noall', '+comments', '+answer']
            if proto == 'tcp':
                args.append('+tcp')
            response = subprocess.run(args, capture_output=True, text=True, timeout=6, check=True).stdout
            if 'status: NOERROR' not in response and not (blocked and 'status: NXDOMAIN' in response):
                raise ValueError('resposta DNS não conclusiva: ' + name + ' ' + proto)
            answers = [line for line in response.splitlines() if line and not line.startswith(';')]
            if blocked and any(not line.split() or line.split()[-1] not in ('0.0.0.0', '::') for line in answers):
                raise ValueError('DNS de domínio bloqueado retornou endereço não nulo')
            if not blocked and not answers:
                raise ValueError('domínio permitido sem resposta A')
            print(name, proto, 'respondeu; filtro:', 'bloqueado' if blocked else 'permitido')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('prepare'); p.add_argument('--lan', required=True)
    sub.add_parser('configure')
    p = sub.add_parser('upstreams'); p.add_argument('--upstream', action='append')
    p = sub.add_parser('verify'); p.add_argument('--allow', required=True); p.add_argument('--block', required=True)
    args = parser.parse_args()
    try:
        if args.action == 'prepare': prepare(args.lan)
        elif args.action == 'configure': configure()
        elif args.action == 'upstreams': upstreams(args.upstream or UPSTREAMS)
        else: verify(args.allow, args.block)
    except (OSError, ValueError, KeyError, urllib.error.URLError, subprocess.SubprocessError) as exc:
        if isinstance(exc, ValueError) and str(exc).startswith('dig ausente:'):
            print(str(exc), file=sys.stderr)
            return 1
        print('Falha:', type(exc).__name__, '; verifique estado local sem expor credenciais.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
