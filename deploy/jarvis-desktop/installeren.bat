@echo off
cd /d "%~dp0"
echo Jarvis wordt geinstalleerd...
python -m venv .venv
if errorlevel 1 (
  echo Python niet gevonden. Installeer Python 3.11 of nieuwer via python.org en vink "Add python.exe to PATH" aan.
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if not exist .env copy .env.example .env
echo.
echo Klaar. Zet nu je sleutel in het bestand .env en start daarna start-jarvis.bat
pause
