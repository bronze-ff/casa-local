@echo off
set CASA_ALLOWED_HOSTS=desktop-daa9sqh.tail634fb2.ts.net
cd /d "C:\Users\adm\CasaLocal"
"C:\Users\adm\CasaLocal\.venv\Scripts\pythonw.exe" -m backend.server --mode local --port 8787
