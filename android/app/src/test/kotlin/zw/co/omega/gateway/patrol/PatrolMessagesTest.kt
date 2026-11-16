package zw.co.omega.gateway.patrol
import org.junit.Assert.*
import org.junit.Test
class PatrolMessagesTest {
    @Test fun offlineFailureKeepsItsActionableReason() {
        assertTrue(PatrolMessages.result("QUEUED",null,"OUTSIDE_CHECKPOINT").contains("Outside"))
        assertTrue(PatrolMessages.result("QUEUED",null,"GPS_UNCERTAIN").contains("not precise"))
        assertTrue(PatrolMessages.result("QUEUED",null,"LOCAL_MATCH").contains("awaiting confirmation"))
    }
    @Test fun uploadingAndReceivingAreNeverCalledVerification() {
        assertFalse(PatrolMessages.result("QUEUED", "ACCEPTED").contains("Verified"))
        assertFalse(PatrolMessages.result("RECEIVED", null).contains("Verified"))
        assertEquals("Verified checkpoint", PatrolMessages.result("RECEIVED", "ACCEPTED"))
        assertTrue(PatrolMessages.result("RECEIVED", "GPS_UNCERTAIN").contains("not precise enough"))
        assertTrue(PatrolMessages.result("RECEIVED", "OUTSIDE_WINDOW").contains("next prompt"))
    }
}
