param([string]$Executable = "$env:USERPROFILE\Desktop\Twinkle Tray Custom\Twinkle Tray Custom.exe")
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw "App missing: $Executable" }
$taskName = 'Twinkle Tray Custom - Login'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$scheduler = New-Object -ComObject Schedule.Service
$scheduler.Connect()
$taskRoot = $scheduler.GetFolder('\')
$tasks = @($taskRoot.GetTasks(1))
$existing = $tasks | Where-Object Name -eq $taskName
if ($existing -and $existing.Definition.Actions.Item(1).Path -ne $Executable) {
    throw 'An unrelated task has the same name; no changes made.'
}
$matching = $tasks | Where-Object {
    $_.Enabled -and $_.Definition.Actions.Count -gt 0 -and
    $_.Definition.Actions.Item(1).Path -eq $Executable -and $_.Name -ne $taskName
}
if ($matching) { Write-Output 'An enabled task already starts this app.'; return }
$definition = $scheduler.NewTask(0)
$definition.RegistrationInfo.Description = 'Start the custom Twinkle Tray at login; before 07:00 it applies minimum brightness.'
$definition.Principal.UserId = $identity
$definition.Principal.LogonType = 3
$definition.Settings.Enabled = $true
$definition.Settings.Hidden = $true
$definition.Settings.DisallowStartIfOnBatteries = $false
$definition.Settings.StopIfGoingOnBatteries = $false
$definition.Settings.ExecutionTimeLimit = 'PT0S'
$definition.Settings.MultipleInstances = 2
$trigger = $definition.Triggers.Create(9)
$trigger.UserId = $identity
$trigger.Enabled = $true
$action = $definition.Actions.Create(0)
$action.Path = $Executable
$action.WorkingDirectory = Split-Path -Parent $Executable
$taskRoot.RegisterTaskDefinition($taskName, $definition, 6, $identity, $null, 3, $null) | Out-Null
Write-Output "Installed: $taskName"
