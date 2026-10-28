# 사용법: server-status.ps1 [-Project <이름>] [-Json] [-Watch N] [-Prefix <문자열>]
# 읽기 전용. 등록부(registry) 파일을 쓰지 않고, 그 순간 OS에 떠 있는 <Prefix><이름> java 프로세스를
# 포트 → PID → java 프로세스 커맨드라인에서 직접 관찰해 프로젝트/워크트리·로컬 여부/브랜치/포트 정합성을 보여준다.
# -Watch N 을 주면 N초 간격으로 화면을 지우고 다시 그린다(Ctrl+C로 종료).
# 상태를 바꾸지 않으므로 다른 세션의 승인·handshake 없이 아무 세션이나 호출할 수 있다.
#
# 모니터링할 프로젝트 목록·접두사는 하드코딩하지 않고 이 스크립트와 같은 폴더의
# servers.local.json(없으면 servers.example.json)에서 읽는다. 형식:
#   { "prefix": "<접두사>", "servers": [{ "name": "...", "port": 0 }, ...] }
# prefix는 프로세스 커맨드라인·작업 디렉터리에서 프로젝트를 찾을 때 이름 앞에 붙는 접두사다
# (예: 폴더가 myapp_sell 이면 이름은 sell, prefix는 myapp_). 쓰는 쪽 네이밍 컨벤션에 맞게 servers.local.json에
# 적어 둔다. -Prefix 파라미터를 주면 그 값이 servers.*.json의 prefix보다 우선한다(즉석 오버라이드용).
param(
    [string]$Project = '',
    [switch]$Json,
    [int]$Watch = 0,
    [string]$Prefix = ''
)
$ErrorActionPreference = 'Stop'
# Invoke-WebRequest 가 호출마다 기본 진행률 표시줄을 그려서(헬스체크 수만큼 콘솔이 깜빡여 보임) 꺼둔다.
$ProgressPreference = 'SilentlyContinue'

$localConfig = Join-Path $PSScriptRoot 'servers.local.json'
$exampleConfig = Join-Path $PSScriptRoot 'servers.example.json'
$configPath = if (Test-Path $localConfig) { $localConfig } else { $exampleConfig }
$config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$serverList = $config.servers
if (-not $Prefix) {
    $Prefix = if ($config.prefix) { $config.prefix } else { 'myapp_' }
}

$ports = [ordered]@{}
foreach ($entry in $serverList) { $ports[$entry.name] = [int]$entry.port }
# 프로세스 커맨드라인에서 "<Prefix><이름>"을 찾는 정규식도 이 목록에서 동적으로 만든다(아래 Get-ServerStatus 안).
$projectNamePattern = ($ports.Keys | ForEach-Object { [regex]::Escape($_) }) -join '|'
$escapedPrefix = [regex]::Escape($Prefix)

if ($Project) {
    $name0 = $Project -replace "^$escapedPrefix", ''
    if (-not $ports.Contains($name0)) { throw "알 수 없는 프로젝트: $name0 ($($ports.Keys -join ', '))" }
}

function Get-ServerStatus {
    $found = @{}
    # 로그 파일 경로를 찾으려고 부모 프로세스를 여러 단계 거슬러 올라가는데, 매 단계를 PID 필터로 따로 조회하면
    # (WMI 호출 1회 ~0.2~0.3초) 못 찾는 프로세스마다 누적돼 전체가 몇 초씩 걸린다. 전체 프로세스를 한 번만
    # 긁어서 PID→프로세스 맵을 만들어 두고, 조상 추적은 메모리에서만 한다(추가 WMI 호출 없음).
    $allProcs = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, CommandLine, Name -ErrorAction SilentlyContinue
    $procMap = @{}
    foreach ($p in $allProcs) { $procMap[[int]$p.ProcessId] = $p }

    # 프로세스마다 Get-NetTCPConnection -OwningProcess 를 따로 부르면 건당 0.3~0.7초(NetTCPIP 공급자 오버헤드)라
    # java 프로세스 수만큼 누적된다. LISTEN 소켓 전체를 한 번만 긁어서 PID→포트 맵으로 메모리에서 찾는다.
    $listenByPid = @{}
    foreach ($l in (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)) {
        $lp = [int]$l.OwningProcess
        if (-not $listenByPid.ContainsKey($lp) -or $l.LocalPort -lt $listenByPid[$lp]) { $listenByPid[$lp] = $l.LocalPort }
    }

    $javaProcs = $allProcs | Where-Object { $_.Name -eq 'java.exe' }
    foreach ($proc in $javaProcs) {
        $cmdLine = $proc.CommandLine
        if (-not $cmdLine) { continue }
        $m = [regex]::Match($cmdLine, "(?i)$escapedPrefix($projectNamePattern)\b")
        if (-not $m.Success) { continue }
        $name = $m.Groups[1].Value.ToLower()

        $procId = [int]$proc.ProcessId
        if (-not $listenByPid.ContainsKey($procId)) { continue }
        $port = $listenByPid[$procId]

        # classpath 안의 어느 경로에나 "...\<Prefix><proj>\.claude\worktrees\<워크트리명>\..." 가 보이면
        # 워크트리명까지만 잘라 워크트리 루트로 쓴다(그 뒤 \build\... 하위경로는 버린다).
        # 문자클래스가 백슬래시·세미콜론을 막아 두어 non-greedy 없이도 그 세그먼트 경계에서 멈춘다.
        $escapedProjDir = "$escapedPrefix$([regex]::Escape($name))"
        $wtm = [regex]::Match($cmdLine, "(?i)[A-Za-z]:[^`"\s]*?$escapedProjDir[\\/]\.claude[\\/]worktrees[\\/][^\\/`"\s;]+")
        $isWorktree = $wtm.Success
        $projDir = $null
        if ($isWorktree) {
            $projDir = $wtm.Value
        }
        else {
            $pm = [regex]::Match($cmdLine, "(?i)[A-Za-z]:[^`"\s]*?$escapedProjDir(?=[\\/;\s`"]|$)")
            if ($pm.Success) { $projDir = $pm.Value }
        }

        $branch = $null; $head = $null; $dirty = $null
        if ($projDir -and (Test-Path $projDir)) {
            try { $branch = (git -C $projDir rev-parse --abbrev-ref HEAD 2>$null) } catch {}
            try { $head = (git -C $projDir rev-parse --short HEAD 2>$null) } catch {}
            try { $dirty = (git -C $projDir status --porcelain 2>$null | Measure-Object -Line).Lines } catch {}
        }

        # 워크트리는 "로컬 기본 포트 + 10000"으로 뜨는 걸 기대값으로 삼는다(이 팀 관례). 다른 포트로 띄워야
        # 하는 사정이 있을 수도 있으므로 이 스크립트는 그 기대값을 강제하지 않고, 실제 포트와 다르면 그냥
        # "다름"으로만 표시한다 — 그 다름이 의도된 것인지는 보는 사람이 판단한다.
        $expected = if ($isWorktree) { $ports[$name] + 10000 } else { $ports[$name] }
        $portWarn = if ($port -eq $expected) { '' } else { "기본값과 다름: 기대 $expected / 실제 $port" }
        $onMain = if ($branch) { [bool]($branch -match '/main$|^main$') } else { $null }

        $logFile = $null
        $ancestorPid = [int]$proc.ParentProcessId
        for ($i = 0; $i -lt 8 -and $ancestorPid; $i++) {
            $parent = $procMap[$ancestorPid]
            if (-not $parent) { break }
            if ($parent.CommandLine -match '>\s*"?([^">]+\.log)"?\s*2>&1') { $logFile = $Matches[1]; break }
            $ancestorPid = [int]$parent.ParentProcessId
        }

        # localhost 로 Invoke-WebRequest 를 바로 쏘면, 포트가 안 열려 있을 때 즉시 거절되지 않고
        # -TimeoutSec 을 그대로 다 채우고서야 실패하는 경우가 있었다(실측: 2초 고정). TCP 연결만 짧게
        # 먼저 확인해서, 실제로 응답이 없는 포트는 0.3초 안에 "응답없음"으로 끝낸다.
        $health = '응답없음'
        $tcpOk = $false
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $connectTask = $client.ConnectAsync('127.0.0.1', $port)
            $tcpOk = $connectTask.Wait(300) -and $client.Connected
            $client.Close()
        }
        catch {}
        if (-not $tcpOk) { $health = '응답없음' }
        else {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            $health = "HTTP $($resp.StatusCode)"
        }
        catch {
            if ($_.Exception.Response) { $health = "HTTP $([int]$_.Exception.Response.StatusCode)" }
        }
        }

        # 같은 프로젝트가 포트를 바꿔 여러 개 떠 있을 수 있으므로 PID 단위로 모두 남긴다.
        $found["$name-$($proc.ProcessId)"] = [pscustomobject]@{
            Project      = $name
            Port         = $port
            ExpectedPort = $expected
            PortWarning  = $portWarn
            Location     = if ($isWorktree) { '워크트리' } else { '로컬' }
            Branch       = $branch
            OnMain       = $onMain
            Head         = $head
            Uncommitted  = $dirty
            Health       = $health
            LogFile      = $logFile
            Path         = $projDir
            Pid          = $proc.ProcessId
        }
    }

    $rows = @()
    foreach ($name in $ports.Keys) {
        $matches = $found.Values | Where-Object { $_.Project -eq $name }
        if ($matches) { $rows += $matches }
        else {
            $rows += [pscustomobject]@{
                Project = $name; Port = $null; ExpectedPort = $ports[$name]; PortWarning = ''
                Location = '중지됨'; Branch = $null; OnMain = $null; Head = $null; Uncommitted = $null
                Health = '-'; LogFile = $null; Path = $null; Pid = $null
            }
        }
    }
    return $rows | Sort-Object Project, Port
}

function Show-ServerStatus {
    $rows = Get-ServerStatus
    if ($Project) {
        $name0 = $Project -replace "^$escapedPrefix", ''
        $rows = $rows | Where-Object { $_.Project -eq $name0 }
    }
    if ($Json) {
        $rows | ConvertTo-Json -Depth 4
        return
    }
    # 출력이 리다이렉트되거나 콘솔 폭이 좁을 때 열이 세로로 쪼개지는 것을 막기 위해 폭을 넉넉히 고정한다.
    $rows | Format-Table Project, Port, ExpectedPort, PortWarning, Location, Branch, OnMain, Head, Uncommitted, Health, Pid -AutoSize |
        Out-String -Width 220
}

if ($Watch -gt 0) {
    while ($true) {
        Clear-Host
        Write-Host "서버 상태 ($(Get-Date -Format 'HH:mm:ss'), ${Watch}초 간격, Ctrl+C 종료)" -ForegroundColor Cyan
        Show-ServerStatus
        Start-Sleep -Seconds $Watch
    }
}
else {
    Show-ServerStatus
}
