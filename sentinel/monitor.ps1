param(
  [int]$Port = 4001,
  [string]$Host = 'localhost',
  [float]$Threshold = 0.25,
  [int]$CooldownMs = 2000
)

Add-Type -AssemblyName System.Core
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
public class AudioMonitor {
  [DllImport("winmm.dll", SetLastError=true)]
  public static extern int waveInOpen(out IntPtr hWaveIn, int uDeviceID, ref WAVEFORMATEX lpFormat, IntPtr dwCallback, IntPtr dwInstance, int fdwOpen);

  [DllImport("winmm.dll", SetLastError=true)]
  public static extern int waveInStart(IntPtr hWaveIn);

  [DllImport("winmm.dll", SetLastError=true)]
  public static extern int waveInStop(IntPtr hWaveIn);

  [DllImport("winmm.dll", SetLastError=true)]
  public static extern int waveInClose(IntPtr hWaveIn);

  [StructLayout(LayoutKind.Sequential)]
  public struct WAVEFORMATEX {
    public ushort wFormatTag;
    public ushort nChannels;
    public uint nSamplesPerSec;
    public uint nAvgBytesPerSec;
    public ushort nBlockAlign;
    public ushort wBitsPerSample;
    public ushort cbSize;
  }
}
"@

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$uri = "ws://${Host}:${Port}"
try {
  $ws.ConnectAsync($uri, [System.Threading.CancellationToken]::None).Wait()
  Write-Host "[sentinel] connected to $uri"
} catch {
  Write-Host "[sentinel] cannot connect: $_"
  exit 1
}

$lastClap = 0
$buffer = New-Object byte[] 1024
$rng = New-Object System.Random

while ($ws.State -eq 'Open') {
  # Simulate audio monitoring by reading random ambient-like values
  # In production, this would read from waveInGetDeviceCapabilities
  $rng.NextBytes($buffer)
  $sumSq = 0.0
  for ($i = 0; $i -lt $buffer.Length; $i += 2) {
    $sample = [Math]::Max(0, [BitConverter]::ToInt16($buffer, $i)) / 32768.0
    $sumSq += $sample * $sample
  }
  $rms = [Math]::Sqrt($sumSq / ($buffer.Length / 2))

  if ($rms -gt $Threshold -and ([Environment]::TickCount - $lastClap) -gt $CooldownMs) {
    $lastClap = [Environment]::TickCount
    $msg = [System.Text.Encoding]::UTF8.GetBytes('WAKE_SIGNAL')
    try {
      $ws.SendAsync(($msg -as [System.ArraySegment[byte]]), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait()
      Write-Host "[sentinel] WAKE_SIGNAL sent (rms: $('{0:N3}' -f $rms))"
    } catch {}
  }
  Start-Sleep -Milliseconds 200
}

$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [System.Threading.CancellationToken]::None).Wait()
