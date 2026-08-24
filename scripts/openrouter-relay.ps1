param(
  [int]$Port = 8090
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $env:OPENROUTER_API_KEY) {
  throw 'OPENROUTER_API_KEY is required.'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

Write-Output "{`"event`":`"openrouter.relay.started`",`"port`":$Port}"

function Write-RelayResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [string]$Body,
    [string]$ContentType = 'application/json; charset=utf-8'
  )

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = $ContentType
  $Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Response.Close($bytes, $false)
}

function Read-Utf8ResponseBody {
  param(
    [System.IO.Stream]$Stream
  )

  if ($Stream.CanSeek) {
    $Stream.Position = 0
  }

  $buffer = [System.IO.MemoryStream]::new()
  try {
    $Stream.CopyTo($buffer)
    return [System.Text.Encoding]::UTF8.GetString($buffer.ToArray())
  } finally {
    $buffer.Dispose()
  }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $path = $context.Request.Url.AbsolutePath

      if ($context.Request.HttpMethod -eq 'GET' -and $path -eq '/healthz') {
        Write-RelayResponse -Response $context.Response -StatusCode 200 -Body '{"status":"ok"}'
        continue
      }

      if ($context.Request.HttpMethod -ne 'POST' -or -not $path.StartsWith('/api/v1/')) {
        Write-RelayResponse -Response $context.Response -StatusCode 404 -Body '{"error":"Not found."}'
        continue
      }

      $reader = [System.IO.StreamReader]::new(
        $context.Request.InputStream,
        $context.Request.ContentEncoding
      )
      try {
        $requestBody = $reader.ReadToEnd()
      } finally {
        $reader.Dispose()
      }

      $headers = @{
        Authorization = "Bearer $env:OPENROUTER_API_KEY"
        Accept = 'application/json'
        'X-Title' = if ($env:OPENROUTER_APP_TITLE) { $env:OPENROUTER_APP_TITLE } else { 'Tehkarta' }
      }
      if ($env:OPENROUTER_HTTP_REFERER) {
        $headers['HTTP-Referer'] = $env:OPENROUTER_HTTP_REFERER
      }

      try {
        $requestBytes = [System.Text.Encoding]::UTF8.GetBytes($requestBody)
        $upstream = Invoke-WebRequest `
          -Uri "https://openrouter.ai$path" `
          -Method Post `
          -Headers $headers `
          -ContentType 'application/json; charset=utf-8' `
          -Body $requestBytes `
          -UseBasicParsing `
          -TimeoutSec 240

        $upstreamBody = Read-Utf8ResponseBody -Stream $upstream.RawContentStream

        Write-RelayResponse `
          -Response $context.Response `
          -StatusCode ([int]$upstream.StatusCode) `
          -Body $upstreamBody
      } catch {
        $statusCode = 502
        $responseBody = '{"error":{"code":502,"message":"OpenRouter relay request failed."}}'
        $responseProperty = $_.Exception.PSObject.Properties['Response']
        if ($responseProperty -and $responseProperty.Value) {
          $errorResponse = $responseProperty.Value
          $statusCode = [int]$errorResponse.StatusCode
          $stream = $errorResponse.GetResponseStream()
          if ($stream) {
            $errorReader = [System.IO.StreamReader]::new(
              $stream,
              [System.Text.Encoding]::UTF8,
              $true
            )
            try {
              $upstreamErrorBody = $errorReader.ReadToEnd()
              if ($upstreamErrorBody) {
                $responseBody = $upstreamErrorBody
              }
            } finally {
              $errorReader.Dispose()
              $stream.Dispose()
            }
          }
        }

        Write-RelayResponse `
          -Response $context.Response `
          -StatusCode $statusCode `
          -Body $responseBody
      }
    } catch {
      [Console]::Error.WriteLine(
        "OpenRouter relay request failed: $($_.Exception.Message)"
      )
      try {
        if ($context.Response.OutputStream.CanWrite) {
          Write-RelayResponse `
            -Response $context.Response `
            -StatusCode 500 `
            -Body '{"error":{"code":500,"message":"OpenRouter relay internal error."}}'
        }
      } catch {
        try {
          $context.Response.Abort()
        } catch {
          # The client may already have closed the connection.
        }
      }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
