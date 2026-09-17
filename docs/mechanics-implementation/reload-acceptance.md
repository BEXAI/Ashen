# A12 representative saved-state reload receipt

Reviewed against runtime implementation `0fb7a9227cf44ae55566c91826817c7a6900b951`; tested revision `f0552d1f594cb3922fecf3a288d7002fba5db70e` leaves that runtime unchanged. The receipt is included here; the later masonry-only fix retains this reload UI and save behavior. The release reviewer exercised the ordinary Game UI, loader and save flow in a disposable guest journey on `ashen-mechanics.localhost`.

Only that local D1 fixture row was seeded. This is a reload/recovery check, not a claim that its defeats or victory were earned in combat. It did not alter the user's journey. The local row was removed after unloading the game; the [fixture receipt](browser/reload-fixture-receipt.json) records cleanup and persisted outcomes.

| Saved fixture and user-visible flow | Verified result | Evidence |
|---|---|---|
| Health 0, `defeated:["w1"]`, `won:false`; reload, Continue, ordinary death dialog, **Rise from the ashes** | Health restores to 140; `w1` remains defeated and `won` remains false; saved revision recorded as 8 | [Death DOM](browser/defeat-reload-dom.txt), [image](browser/defeat-reload.png), [recovered DOM](browser/defeat-recovered-dom.txt), fixture receipt |
| Health 0, `won:true`, all ten defeated IDs and three shrines; reload ordinary Game | Victory dialog explains mutual defeat and offers **Return to shrine**; no competing ordinary death dialog in the captured DOM | [Victory DOM](browser/victory-zero-hp-reload-dom.txt), [image](browser/victory-zero-hp-reload.png) |
| Use **Return to shrine**, save, then reload again | Health 140, checkpoint `crown`, position (11,−39), `won:true`, all ten defeats and `cinder/dusk/crown` remain; the UI shows completed objectives and Crown Shrine after re-entry | [Recovered DOM](browser/victory-recovered-dom.txt), [reloaded DOM](browser/victory-recovered-reload-dom.txt), [reloaded image](browser/victory-recovered-reload.png), fixture receipt |

The persisted ten IDs are `w1` through `w9` and `king`. The DOM/images establish the visible UI and recovery route; the JSON receipt establishes the persisted values and local cleanup. Together with automated lethal/reward/death tests, these close the named representative A12 reload cases. No exhaustive reload permutation, actual gameplay victory, physical-phone result or deployment is claimed.
