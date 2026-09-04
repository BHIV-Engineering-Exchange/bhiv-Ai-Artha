# screenshots

Screenshot evidence is required at the review gate. The connector and
local mock flow can produce console/text evidence now (captured under
../evidence_packet and ../runtime_logs). The six required screenshots
must be captured against the REAL Tally gateway once the network path is
available (see deployment_proof/).

Required captures:
1. Tally connection/configuration state with secrets hidden — GET /api/v1/tally-connect/config
2. Retrieved Bright Connection data — GET /api/v1/tally-connect/parties | /outstanding | /vouchers
3. ARTHA financial view/output — dealer summary endpoint
4. SETU receiving/using the data — mock SETU collector log (or real SETU)
5. Final demo flow — tally-connect-demo.js output
6. Error/read-only behaviour — write-rejection + auth-failure evidence

Because real Tally is currently unreachable from this machine (different
subnet: this PC 10.115.227.x vs Tally 192.168.0.72), captures in this
packet are from the local mock flow and are marked MOCK accordingly.
They do NOT satisfy the final review gate — real-data captures are required.
