# Depuis la racine OsteoPilot ; aucun secret dans l'historique PowerShell.
$ErrorActionPreference = 'Stop'
$env:ADMIN_EMAIL = Read-Host 'Email du premier administrateur'
$env:ADMIN_FIRST_NAME = Read-Host 'Prénom'
$env:ADMIN_LAST_NAME = Read-Host 'Nom'
$adminSecurePassword = Read-Host 'Mot de passe (14 caractères minimum, 72 octets maximum)' -AsSecureString
$adminPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecurePassword)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPasswordPointer)
  npm run admin:create
  if ($LASTEXITCODE -ne 0) { throw 'Création du premier administrateur refusée.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPasswordPointer)
  Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_FIRST_NAME -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_LAST_NAME -ErrorAction SilentlyContinue
  $adminSecurePassword.Dispose()
}
