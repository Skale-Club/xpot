# Plaque production catalog

The production assistant offers fifteen services across Stand/Plate and Small/Large, with only approved White/Black bodies. Menu provides six styles. Each of the 160 physical models offers the three measured NFC mounts, for 480 combinations. Logos retain their accent colors.

Five named steps cover Design, Appearance, NFC, Quantity and Review. The service selector follows the flyer logos, Menu choices show the whole piece, NFC choices have illustrations, and the review shows the exact model, materials and print layout. Existing Menu font API requests remain supported alongside exact model selection.

New serialized requests fit one physical printer plate: one batch, fresh public codes, and a quantity bounded by the chosen bed. The server enforces the same limit for direct API and MCP requests. Existing multi-plate requests retain their history, reprint rules and stock movements.

Migration `0080_flyer_design_catalog.sql` creates or versions catalog models. It does not issue codes, create jobs, change inventory quantities or overwrite a recipe referenced by an old order. Applying it again does not duplicate versions. The generator in `print-pipeline/catalog/design_catalog.py` reproduces the approved catalog.

Black and white parts default to ELEGOO standard PLA. Existing versioned settings remain attached to old jobs. The new baseline uses 215/210 °C nozzle temperature, 60/55 °C textured bed temperature, and 12 mm³/s maximum flow. Physical calibration and actual prints must be recorded from the real machine.

## Deployment and bench

Normal CI and deployment run the migration before starting the app. The updated local bench must use the service builders and bundled font files from this release. `python print-pipeline/bench.py doctor` checks the local runtime. Pairing a computer creates a persistent device credential and is a separate authorized setup action; a disconnected computer is shown on the production page. No test should create real production codes or mark real jobs printed.

The Stuscle retail and wholesale release uses the same 160 design slugs, 480 combinations and approved palette. Prices come from the owner's Notion decision: retail Stand Small/Large $40/$60 and Plate Small/Large $25/$35; wholesale $25/$40 and $15/$20. Shipping is separate.

Local verification includes the full TypeScript suite, type check and build, Python pipeline tests, and NFC provisioner tests. The catalog integration test checks the complete matrix, exact style/NFC mapping, migration idempotence, and preservation of old recipes and serial allocation behavior. Browser verification must cover the live assistant after deployment without confirming a real generation.
