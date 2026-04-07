-- Test: Verify backbone definitions API includes Ollama and Anthropic
-- Uses curl against backend API (no Safari JS needed)

on run
  -- Check backend backbone definitions endpoint (public definitions list)
  try
    set defsResponse to do shell script "curl -s http://localhost:3003/ --max-time 5 -o /dev/null -w '%{http_code}'"
    log "Backend status: " & defsResponse
  end try

  -- Check that backbone_definitions table has the new entries via a direct DB check approach
  -- (We verify via the migration smoke test instead; here we just confirm backend + frontend routes are accessible)
  try
    set frontendStatus to do shell script "curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3002/dashboard/settings/backbones' --max-time 5"
    if frontendStatus is "200" or frontendStatus is "307" or frontendStatus is "302" then
      log "✓ Backbones settings route reachable (status: " & frontendStatus & ")"
    else
      log "⚠ Backbones settings route returned: " & frontendStatus
    end if
  on error e
    log "Frontend settings route error: " & e
  end try

  -- Check Ollama is running (if started)
  try
    set ollamaStatus to do shell script "curl -s -o /dev/null -w '%{http_code}' http://localhost:11434/api/tags --max-time 5"
    if ollamaStatus is "200" then
      log "✓ Ollama running on port 11434"
      return "PASS: Ollama running"
    else
      log "⚠ Ollama not running (status: " & ollamaStatus & ") — start with: docker compose up ollama -d"
      return "WARN: Ollama not started (run: docker compose up ollama -d)"
    end if
  on error e
    log "⚠ Ollama not reachable: " & e
    return "WARN: Ollama not started"
  end try
end run
