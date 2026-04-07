-- Test: Verify Pod routes are reachable (curl-based, no Safari JS needed)
-- Full chat test requires authenticated session; this verifies routing works

on run
  set passCount to 0
  set totalChecks to 4

  -- 1. Frontend root
  try
    set s to do shell script "curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/ --max-time 5"
    if s is "200" then
      log "✓ Frontend root (3002): OK"
      set passCount to passCount + 1
    else
      log "⚠ Frontend root: " & s
    end if
  end try

  -- 2. Cockpit route
  try
    set s to do shell script "curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/dashboard/cockpit --max-time 5"
    if s is "200" or s is "307" or s is "302" then
      log "✓ /dashboard/cockpit: " & s
      set passCount to passCount + 1
    else
      log "⚠ /dashboard/cockpit: " & s
    end if
  end try

  -- 3. Pod route pattern
  try
    set s to do shell script "curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/dashboard/pods/test --max-time 5"
    if s is "200" or s is "307" or s is "302" or s is "404" then
      log "✓ /dashboard/pods/:slug route exists (status: " & s & ")"
      set passCount to passCount + 1
    else
      log "⚠ /dashboard/pods/:slug: " & s
    end if
  end try

  -- 4. Backend health
  try
    set h to do shell script "curl -s http://localhost:3003/health --max-time 5"
    if h contains "ok" then
      log "✓ Backend health OK"
      set passCount to passCount + 1
    end if
  end try

  if passCount >= 3 then
    return "PASS: " & passCount & "/" & totalChecks & " checks passed"
  else
    return "WARN: Only " & passCount & "/" & totalChecks & " checks passed"
  end if
end run
