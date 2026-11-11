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

test('runtime healthcheck uses bounded .NET loopback HTTP without apt or curl', () => {
  const dockerfile = source('docker/Dockerfile.api')
  const project = source('src/backend/applications/Vuxo.HealthProbe/Vuxo.HealthProbe.csproj')
  const program = source('src/backend/applications/Vuxo.HealthProbe/Program.cs')
  assert.doesNotMatch(dockerfile, /apt-get|curl --fail/)
  assert.match(dockerfile, /COPY --from=build \/app\/health \.\/health/)
  assert.match(dockerfile, /CMD \["dotnet", "\/app\/health\/Vuxo\.HealthProbe\.dll"\]/)
  assert.match(project, /<OutputType>Exe<\/OutputType>/)
  assert.match(program, /http:\/\/127\.0\.0\.1:8080\/health/)
  assert.match(program, /HttpStatusCode\.OK/)
  assert.match(program, /TimeSpan\.FromSeconds\(diagnostic \? \(edge \? 8 : 6\) : 2\)/)
  assert.match(program, /catch \(HttpRequestException error\)/)
  assert.match(program, /catch \(TaskCanceledException\)/)
  assert.match(program, /http:\/\/api:8080\/health/)
  assert.match(program, /https:\/\/api\.vuxoapi\.xyz\/health/)
  assert.match(program, /AllowAutoRedirect = false/)
  assert.match(program, /Console\.WriteLine\(match\.Groups\[1\]\.Value\)/)
})
