@echo off
@echo off
setlocal enabledelayedexpansion

REM Conversion runs locally on Windows, not inside Docker.
REM Usage: double-click or run from repo root.

set "INPUT_DIR=%~dp0..\CityGmls"
set "OUTPUT_DIR=%~dp0..\frontend\models\generated"
set "C2G_EXE=D:\EPARtwin_Projekt\Website\CityGML2glTF_converter\collada2gltf.exe"

if not exist "%OUTPUT_DIR%" (
  mkdir "%OUTPUT_DIR%"
)

if not exist "%C2G_EXE%" (
  echo c2g not found at %C2G_EXE%
  exit /b 1
)

for %%F in ("%INPUT_DIR%\*.gml") do (
  set "BASENAME=%%~nF"
  echo Converting %%~nxF...
  "%C2G_EXE%" --input "%%~fF" --output "%OUTPUT_DIR%\!BASENAME!" --lod LOD2 --type MULTI_SURFACE
  if errorlevel 1 (
    echo Failed on %%~nxF
    exit /b 1
  )
)

echo Done. Output in %OUTPUT_DIR%
exit /b 0
