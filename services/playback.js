function shouldPersistProgress(currentTime, lastSavedProgress) {
    const seconds = Math.floor(Number(currentTime) || 0)
    const lastSaved = Math.floor(Number(lastSavedProgress))
    if (seconds < 0 || seconds === lastSaved) return false
    if (lastSaved < 0) return seconds === 0 || seconds >= 30
    return seconds - lastSaved >= 30
}

export { shouldPersistProgress }
