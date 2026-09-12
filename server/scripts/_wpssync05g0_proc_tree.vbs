' 05-G-0 read-only forensics: process tree of 5876 listeners + node processes
On Error Resume Next
Dim wmi, wql, rs, p, out
Set wmi = GetObject("winmgmts:\\.\root\cimv2")

' 1) All node.exe processes
out = "===NODE_PROCESSES===" & vbCrLf
wql = "SELECT ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate FROM Win32_Process WHERE Name='node.exe'"
Set rs = wmi.ExecQuery(wql)
For Each p In rs
  out = out & "PID=" & p.ProcessId & " PPID=" & p.ParentProcessId & " CREATED=" & p.CreationDate & vbCrLf
  out = out & "  EXE=" & p.ExecutablePath & vbCrLf
  out = out & "  CMD=" & p.CommandLine & vbCrLf
Next

' 2) Resolve parent chain for each node PID found (up to 4 hops)
Dim pids(20), n, i
n = 0
For Each p In rs
  pids(n) = p.ProcessId : n = n + 1
Next
out = out & "===PARENT_CHAINS===" & vbCrLf
For i = 0 To n - 1
  Dim cur, hop
  cur = pids(i) : hop = 0
  out = out & "-- chain of " & pids(i) & " --" & vbCrLf
  Do While hop < 4 And cur <> 0
    Set q = wmi.ExecQuery("SELECT ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath FROM Win32_Process WHERE ProcessId=" & cur)
    Dim found : found = False
    For Each pp In q
      found = True
      out = out & "  <" & hop & "> " & pp.ProcessId & " ppid=" & pp.ParentProcessId & " name=" & pp.Name & " exe=" & pp.ExecutablePath & vbCrLf
      out = out & "     cmd=" & pp.CommandLine & vbCrLf
      cur = pp.ParentProcessId
    Next
    If Not found Then
      out = out & "  <" & hop & "> PID " & cur & " not found (exited)" & vbCrLf
      cur = 0
    End If
    hop = hop + 1
  Loop
Next

' 3) Console hosts holding these processes (winpty/conhost/cmd/powershell/wscript) - just list shells
out = out & "===SHELLS===" & vbCrLf
Set rs2 = wmi.ExecQuery("SELECT ProcessId,ParentProcessId,Name,CommandLine FROM Win32_Process WHERE Name='cmd.exe' OR Name='powershell.exe' OR Name='pwsh.exe' OR Name='conhost.exe' OR Name='WindowsTerminal.exe'")
For Each s In rs2
  out = out & s.ProcessId & " ppid=" & s.ParentProcessId & " " & s.Name & " cmd=" & s.CommandLine & vbCrLf
Next

WScript.Echo out
