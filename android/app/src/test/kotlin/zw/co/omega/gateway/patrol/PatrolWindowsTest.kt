package zw.co.omega.gateway.patrol
import org.junit.Assert.*
import org.junit.Test
class PatrolWindowsTest {
    @Test fun timerDoesNotClearSignInFields() {
        assertFalse(PatrolWindows.shouldRefreshScreen(false, false))
        assertFalse(PatrolWindows.shouldRefreshScreen(false, true))
        assertFalse(PatrolWindows.shouldRefreshScreen(true, true))
        assertTrue(PatrolWindows.shouldRefreshScreen(true, false))
    }
    @Test fun windowsAreIdenticalOfflineAndOnline() {
        assertFalse(PatrolWindows.isOpen(99, 100, 200, 300))
        assertTrue(PatrolWindows.isOpen(100, 100, 200, 300))
        assertTrue(PatrolWindows.isOpen(200, 100, 200, 300))
        assertFalse(PatrolWindows.isOpen(201, 100, 200, 300))
        assertFalse(PatrolWindows.isOpen(200, 100, 200, 200))
    }
    @Test fun handoverBoundaryBelongsOnlyToIncomingGuard() {
        assertFalse(PatrolWindows.mayCapture(200, 100, 400, 200))
        assertTrue(PatrolWindows.mayCapture(199, 100, 400, 200))
        assertTrue(PatrolWindows.mayCapture(200, 200, 400, null))
        assertFalse(PatrolWindows.mayCapture(400, 200, 400, null))
    }
}
