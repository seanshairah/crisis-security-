package zw.co.crisis.security.patrol
import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject
class GateRulesTest {
    @Test fun databaseKeyOrderIsNotADiscrepancy() {
        assertTrue(GateRules.same(JSONObject("""{"items":[{"name":"Maize","quantity":25}],"party":"Supplier"}"""),JSONObject("""{"party":"Supplier","items":[{"quantity":25.0,"name":"Maize"}]}""")))
    }
    @Test fun quantityAndPartyChangesAreDiscrepancies() {
        assertFalse(GateRules.same(JSONObject("""{"quantity":25}"""),JSONObject("""{"quantity":24}""")))
        assertFalse(GateRules.same(JSONObject("""{"party":"Supplier"}"""),JSONObject("""{"party":"Other"}""")))
        assertFalse(GateRules.same(JSONObject("""{"unit":"bags"}"""),JSONObject("""{"unit":"kg"}""")))
    }
}
