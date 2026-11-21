Option Explicit

Dim shell, fso, projectFolder, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectFolder = fso.GetParentFolderName(WScript.ScriptFullName)

' Inicia o servidor sem exibir uma janela de terminal.
command = "cmd.exe /c cd /d " & Chr(34) & projectFolder & Chr(34) & " && npm start"
shell.Run command, 0, False

' Dá tempo para o servidor iniciar antes de abrir o navegador.
WScript.Sleep 1500
shell.Run "http://127.0.0.1:4173", 1, False
