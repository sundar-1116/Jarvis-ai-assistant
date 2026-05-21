tell application "Google Chrome"
    repeat with w in windows
        set i to 1
        repeat while i ≤ (count tabs of w)
            if URL of tab i of w contains "youtube" then
                close tab i of w
            else
                set i to i + 1
            end if
        end repeat
    end repeat
end tell
