> Historical Safari implementation audit. The counts/build/publication statements below describe the earlier implementation, not the current v11-character/v13-dungeon/v2-prop candidate. Current evidence and pending physical-device/build/deployment gates are in [RELEASE_PROVENANCE.md](RELEASE_PROVENANCE.md).

# Safari on iPhone audit

## Visual-v8 addendum — 2026-09-08

Staged room/character loads, serialized quality changes, shared skeletal assets,
bounded effects and 30 Hz Performance rendering are implemented. Auto retains
adaptive output and its 60 Hz ceiling. New tests cover PNG fallback rigs,
failed room loads, repeated traversal, independent skeletons and cleanup.

The cloud browser could not create a WebGL context. Physical iPhone, GPU visual,
frame pacing and thermal checks remain pending. See `VISUAL_UPGRADE_REPORT.md`
and `VISUAL_ASSET_VALIDATION.json`. Advisory findings below describe the earlier
audit; this update does not claim a fresh security audit.

## Original Safari audit

Date: 2026-09-07. Scope: the client game, touch controls, renderer lifecycle, graphics assets, progress API, schemas, dependency lockfile and production build.

## Findings addressed

| Finding | Change |
| --- | --- |
| Full GPU work continued under pause menus | A tested render loop draws once for pause or an explicit invalidation, cancels scheduling while hidden, and caps full renders at 60 Hz. |
| Touch devices could remain on 4K when storage throws | Auto is selected independently of preference-storage availability. Explicit user selections are preserved. |
| Mobile HD combined costly effects and oversized textures | Auto ships six 1K masonry maps, adaptive output, smaller shadows and fewer lights. Mobile Auto/HD skip screen-space AO and planar reflections. 4K remains selectable. |
| Switching quality could leave the original reflection behavior active | Reflection visibility and callbacks now read live quality state. A wet stone surface remains when reflections are disabled. |
| Resizing Safari chrome reset held controls and repeatedly allocated buffers | Only orientation/cancellation/focus changes reset input; viewport resizing is debounced and unchanged buffer sizes are skipped. |
| Joystick motion repeatedly measured layout and rendered React state | Bounds are measured once per gesture; visual movement is batched with requestAnimationFrame. Pointer capture errors and global releases are handled. |
| Short landscape viewports crowded controls | Added a compact layout with 56–68 px combat controls, central save/prompt placement, safe-area padding and scrollable recovery errors. |
| Graphics loss required a reload | Recovery saves and retains the character snapshot, then rebuilds in Performance mode. Partial startup failures and repeated disposal release resources safely. |
| Audio interruption/resume and overlapping save events were fragile | User gestures attempt to resume non-running audio; pause/background suspend it. Save triggers coalesce and purchases serialize against saves. |
| Source lint exposed unchecked world IDs and render-time ref access | World IDs now satisfy the Progress types; callback/preferences refs update after commit; unused imports and geometry were removed. |

The backend retains anonymous guest play, secure guest cookies, owner isolation, strict input validation, server-calculated equipment prices and revision conflicts. The migration and access audience are unchanged.

## Verification

The initial TypeScript and syntax checks passed before edits. The final checks cover source lint, TypeScript, source and compiled JavaScript syntax, automated game/runtime regressions, asset dimensions and a production build. TypeScript passed; source lint completed with zero errors and zero warnings; all 42 automated regressions passed. The production dependency scan (`npm audit --omit=dev`) reports zero advisory matches. The production build completed successfully. Source and compiled JavaScript syntax checks also passed before publishing.

Six new masonry images were verified as 1024×1024 WebP files. These are downsampled from the existing locally shipped CC0 Poly Haven textures; 2K and 4K versions remain available.

## Dependencies

The initial production dependency audit reported five affected package entries. The update patches Next.js and its ESLint configuration, React and its server component packages, affected transitive dependencies, and compatible Cloudflare/Vite tooling. npm advisory matches do not establish exploitability in this particular application. The locked versions include Next.js/ESLint 16.3.4, React/React DOM/react-server-dom-webpack 19.2.8, Vite 8.2.2, Cloudflare Vite plugin 1.54.4 and Wrangler 4.129.0. Three.js and three-mesh-bvh are unchanged.

The complete npm audit still reports **six development-chain findings: two high and four moderate**, grouped under Vinext → image-size and drizzle-kit → esbuild-kit → old esbuild. These are package matches, not six separate application exploits. npm offers a Vinext major beta migration and a Drizzle downgrade; neither is an appropriate automatic change to this site's hosting/migration foundation. They remain explicit follow-up work. This is not an all-dependencies-clean security audit.

The image-size findings concern malformed image parsing; this game uses locally shipped assets and has no upload feature. The old esbuild finding concerns its development server, which is not started for this publication. These observations narrow the relevant exposure but are not proof that every advisory is unreachable. A future framework/tooling update should remove both dependency chains and repeat the build/migration checks.

## Limits

No browser UI test, physical iPhone test, Safari GPU profile, thermal measurement or battery benchmark was performed. Auto resolution and the 60 Hz cap are tested scheduling/pixel-budget policies, not a frame-rate promise. Recovery retains character progress; living enemies restart. A browser or OS termination can still lose progress that has not reached the server. There is no offline gameplay-save store.

## References

- [WebKit viewport units and Safari](https://webkit.org/blog/12669/new-webkit-features-in-safari-15-5/)
- [Safari 16.1 viewport behavior](https://webkit.org/blog/13399/webkit-features-in-safari-16-1/)
- [AudioContext state and interruption](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)
- [Next.js Server Actions advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj)
- [React server-component advisory](https://github.com/advisories/GHSA-wx67-qw84-cm4g)
- [fast-uri normalization advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-f65p-4m7j-42xc)
