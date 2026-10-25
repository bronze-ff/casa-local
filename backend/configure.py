"""Interactive setup stays in the local terminal, never the web UI."""
import argparse
import getpass
import json
from pathlib import Path

from .adapters import climate_code_key, discover
from .config import IDS, load_config, save_config, validate_config
from .models import AppError


def main():
    parser = argparse.ArgumentParser(description="Configuração local com armazenamento Windows DPAPI por usuário.")
    sub = parser.add_subparsers(dest="operation", required=True)
    sub.add_parser("list", help="Listar somente IDs lógicos e adaptadores, sem segredos.")
    sub.add_parser("discover", help="Escutar anúncios locais por até 15 segundos; só exibir IDs já configurados.")
    setup = sub.add_parser("device", help="Cadastrar aparelho; nenhuma consulta cloud ou comando de hardware.")
    setup.add_argument("id", choices=sorted(IDS))
    setup.add_argument("--schema", required=True, type=Path, help="Arquivo JSON com mapeamento DP ou códigos IR aprendidos.")
    setup.add_argument("--adapter", choices=["dp", "ir"], required=True)
    setup.add_argument("--control-type", type=int, choices=[1, 2], help="Obrigatório para IR; firmware comprovado.")
    remove = sub.add_parser("remove", help="Remover a configuração local de um aparelho.")
    remove.add_argument("id", choices=sorted(IDS))
    canonical = sub.add_parser("climate-key", help="Imprimir a chave canônica de um estado completo do ar para o mapa IR.")
    canonical.add_argument("--power", choices=["on", "off"], required=True)
    canonical.add_argument("--temperature", type=int, choices=range(17, 31), required=True)
    canonical.add_argument("--mode", choices=["cool", "heat", "dry", "fan", "auto"], required=True)
    canonical.add_argument("--fan", choices=["auto", "low", "medium", "high"], required=True)
    args = parser.parse_args()
    try:
        if args.operation == "climate-key":
            print(climate_code_key({"power": args.power == "on", "temperature": args.temperature, "mode": args.mode, "fan": args.fan}))
            return
        config = load_config()
        if args.operation == "list":
            print(json.dumps({logical_id: {"adapter": item["adapter"], "configured": True} for logical_id, item in config.items()}, ensure_ascii=False, indent=2))
        elif args.operation == "discover":
            print(json.dumps({"devices": discover(config), "message": "Somente aparelhos configurados; nenhuma chave ou payload retornado."}, ensure_ascii=False, indent=2))
        elif args.operation == "remove":
            config.pop(args.id, None)
            save_config(config)
            print("Configuração removida. Reinicie o servidor local.")
        else:
            provider_id = input("ID físico confirmado deste aparelho/emissor: ").strip()
            address = input("IP literal privado deste aparelho/emissor: ").strip()
            protocol = float(input("Versão de protocolo confirmada (ex.: 3.3): ").strip())
            key = getpass.getpass("Chave local (não aparece na tela): ")
            schema = json.loads(args.schema.read_text(encoding="utf-8-sig"))
            if isinstance(schema, dict) and "localKey" in schema:
                raise AppError("Não coloque chaves no arquivo de esquema.")
            config[args.id] = {"providerId": provider_id, "ip": address, "localKey": key, "protocol": protocol, "adapter": args.adapter, "schema": schema}
            if args.adapter == "ir":
                config[args.id]["controlType"] = args.control_type
            validate_config(config)
            save_config(config)
            print("Configuração salva com Windows DPAPI para este usuário. Reinicie o servidor em modo local.")
    except (AppError, ValueError, OSError, EOFError, KeyboardInterrupt):
        print("Operação não concluída. Confira IP privado, protocolo, chave e esquema explícito. Nenhum segredo foi exibido.")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
