package zw.co.crisis.security.patrol
import org.junit.Assert.*
import org.junit.Test
class CheckpointCodeTest {
    private val checkpoint = CoordinateCheckpoint("checkpoint-1","site-1",-26.204103,28.047304,100)
    private val raw = "CS2|checkpoint-1|site-1|-26.204103|28.047304|100|${"n".repeat(22)}|${"s".repeat(43)}"
    @Test fun cachedHashAuthenticatesCoordinatesOffline() {
        assertEquals(checkpoint,CheckpointCode.verified(raw,CheckpointCode.sha256(raw),checkpoint))
        assertNull(CheckpointCode.verified(raw.replace("-26.204103","-25.204103"),CheckpointCode.sha256(raw),checkpoint))
        assertNull(CheckpointCode.verified(raw,CheckpointCode.sha256(raw),checkpoint.copy(siteId="other")))
        assertNull(CheckpointCode.verified(raw,CheckpointCode.sha256(raw),checkpoint.copy(radiusM=500)))
    }
    @Test fun copiedCodeCannotVerifyAnotherPosition() {
        assertEquals("LOCAL_MATCH",CheckpointCode.locationDecision(checkpoint,-26.204103,28.047304,5f,false))
        assertEquals("OUTSIDE_CHECKPOINT",CheckpointCode.locationDecision(checkpoint,-26.214103,28.047304,5f,false))
    }
    @Test fun inaccurateMissingBoundaryAndMockLocationsFail() {
        assertEquals("GPS_UNCERTAIN",CheckpointCode.locationDecision(checkpoint,null,null,null,false))
        assertEquals("GPS_UNCERTAIN",CheckpointCode.locationDecision(checkpoint,-26.204103,28.047304,100f,false))
        assertEquals("GPS_UNCERTAIN",CheckpointCode.locationDecision(checkpoint,-26.204103,28.047304,Float.NaN,false))
        assertEquals("GPS_UNCERTAIN",CheckpointCode.locationDecision(checkpoint,-26.204103,28.047304,0f,false))
        assertEquals("GPS_UNCERTAIN",CheckpointCode.locationDecision(checkpoint,-26.2049,28.047304,30f,false))
        assertEquals("MOCK_LOCATION",CheckpointCode.locationDecision(checkpoint,-26.204103,28.047304,5f,true))
    }
    @Test fun freshGpsCanFinishAfterQrButStaleAndFutureFixesFail() {
        assertTrue(CheckpointCode.gpsTimeValid(100000,160000,160000))
        assertFalse(CheckpointCode.gpsTimeValid(100000,89999,100000))
        assertFalse(CheckpointCode.gpsTimeValid(100000,190001,190001))
        assertFalse(CheckpointCode.gpsTimeValid(100000,140000,100000))
    }
    @Test fun legacySignRequiresUpgrade() {
        val old="crisis:checkpoint:opaque";assertNull(CheckpointCode.verified(old,CheckpointCode.sha256(old),checkpoint))
    }
}
