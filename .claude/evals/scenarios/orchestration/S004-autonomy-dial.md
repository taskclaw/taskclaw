# S004: Autonomy dial persists per pod

## Preconditions
- Pod settings page accessible
- User has edit permissions on pod

## Steps
1. Navigate to Pod Settings
2. Locate the Autonomy Dial / control
3. Switch from level 1 (Observe) to level 3 (Act with Confirmation)
4. Save / confirm
5. Reload the page

## Expected Results
- Autonomy dial shows level 3 after reload
- When triggering a single-pod task at level 3, the task executes with a confirmation step (not fully automatic)
- At level 4 (Act Autonomously), same-pod tasks run without approval card

## Viewports
- Desktop: 1280x720
