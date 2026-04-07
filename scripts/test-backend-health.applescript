-- Test: Verify backend health endpoint responds (curl-based, no Safari JS needed)
on run
  try
    set healthResponse to do shell script "curl -s http://localhost:3003/health --max-time 5"
    if healthResponse contains "ok" then
      log "✓ Backend health OK: " & healthResponse
      return "PASS"
    else
      error "Backend health unexpected response: " & healthResponse
    end if
  on error e
    error "FAIL: Backend health check failed — " & e
  end try
end run
