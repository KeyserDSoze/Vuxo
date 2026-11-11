import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

// CVE-2026-114147: both SignalR Redis 10.0.14 and runtime 10.0.14 are vulnerable.
test('API and test ASP.NET Core packages stay at the patched 10.0.15 baseline', () => {
  const projects = [
    ['src/backend/applications/Vuxo.Api/Vuxo.Api.csproj', [
      'Microsoft.AspNetCore.Authentication.JwtBearer',
      'Microsoft.AspNetCore.OpenApi',
      'Microsoft.AspNetCore.SignalR.StackExchangeRedis',
    ]],
    ['tests/backend/Vuxo.Api.Tests/Vuxo.Api.Tests.csproj', [
      'Microsoft.AspNetCore.Mvc.Testing',
      'Microsoft.AspNetCore.SignalR.Client',
    ]],
  ]
  for (const [path, packages] of projects) {
    const xml = source(path)
    for (const name of packages) {
      assert.ok(xml.includes('<PackageReference Include="' + name + '" Version="10.0.15"'), path + ': ' + name)
    }
    // Only ASP.NET Core package refs are under this advisory. An unrelated
    // Npgsql/OpenTelemetry 10.0.x package must not trigger a false positive.
    const aspNetVersions = [...xml.matchAll(/<PackageReference Include="Microsoft\.AspNetCore\.[^"]+" Version="([^"]+)"/g)]
      .map(match => match[1])
    assert.ok(aspNetVersions.length > 0, path)
    assert.ok(aspNetVersions.every(version => version === '10.0.15'), path)
  }
})

test('patched runtime and both Docker build paths always refresh base images', () => {
  assert.match(source('docker/Dockerfile.api'), /^FROM mcr\.microsoft\.com\/dotnet\/aspnet:10\.0\.15 AS runtime$/m)
  assert.match(source('scripts/test-docker-runtime.sh'), /docker build --pull --file docker\/Dockerfile\.api/)
  assert.match(source('.github/workflows/deploy-pi3.yml'), /^\s+pull: true$/m)
})

test('backend does not suppress NuGet audits or warnings-as-errors', () => {
  assert.match(source('Directory.Build.props'), /<TreatWarningsAsErrors>true<\/TreatWarningsAsErrors>/)
  assert.doesNotMatch(source('Directory.Build.props'), /NuGetAudit\s*>\s*false/i)
})
