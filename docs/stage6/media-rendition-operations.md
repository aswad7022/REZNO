# Gate 6B Media Rendition Operations

## Profiles and source authority

The server owns exactly three immutable WebP profiles:

| Profile | Maximum box | Current slots |
| --- | --- | --- |
| `AVATAR_256_WEBP` | 256 × 256 | Customer avatar |
| `CARD_640_WEBP` | 640 × 640 | Business/Store logos, Service and Menu primary media |
| `HERO_1600_WEBP` | 1600 × 1600 | Covers, galleries and Product/detail media |

No route or payload accepts arbitrary width, height, crop, quality, codec,
source URL, output key, or transformation expression. A profile is derived
from an ACTIVE canonical `MediaBinding.slot`. Ownership and visibility are
always inherited from the source `StoredAsset`; `MediaRendition` has no Person
or Organization authority of its own.

The rendition identity is unique on source asset ID, exact source version, and
profile. Its fingerprint also binds source checksum and provider object
version. The output key is generated server-side from that identity and is
write-once.

## Generation and publication

`MEDIA_RENDITION_DISCOVERY` scans a bounded deterministic page of ACTIVE,
READY sources missing the current required profile. It creates only exact
`MEDIA_RENDITION_GENERATE` children. The item handler:

1. reloads the asset, ACTIVE bindings, current job lease/fence, and exact
   source generation;
2. owns one expiring rendition claim;
3. repeats the complete storage inspection and scanner truth;
4. decodes with Sharp 0.35.3 under byte, dimension, page, animation, and
   40-million-pixel source bounds;
5. auto-orients, resizes inside the closed box without enlargement, emits
   deterministic WebP, and carries no input EXIF/GPS/XMP/ICC/comment metadata;
6. writes one server key without overwrite, then HEADs and bounded-reads the
   output to verify MIME, bytes, checksum, dimensions, and provider generation;
7. reloads the source/binding/rendition and current platform fence before
   publishing READY.

If the source, binding, claim, lease, or generation changes, output cannot
become READY. A known written stale output is persisted as `SUPERSEDED` and
enters exact deletion; an uncertain write never becomes READY.

## Stable delivery

Existing stable paths remain authoritative. Public media, private Customer
avatar, and Business preview services perform their existing authorization,
then select the newest READY rendition matching the current source generation
and binding-derived profile. Authorization and canonical state are checked
again around provider target creation. If no legal verified rendition is
available—or its provider target fails—the service safely falls back to the
inspected READY original.

Detached, rejected, deleted, wrong-generation, failed, deletion-pending, and
superseded renditions are never served. Legacy URL fallback remains disabled
after canonical slot history exists. DTOs expose only stable application paths;
provider keys, versions, checksums, and signed targets remain internal.

## Cleanup and incident handling

`MEDIA_RENDITION_CLEANUP_DISCOVERY` finds only exact FAILED, SUPERSEDED, or
DELETE_PENDING rows, and `MEDIA_RENDITION_DELETE` resolves the key from the
canonical row. Deletion is provider-confirmed or confirmed absent. It never
deletes the original asset, lists a bucket, uses a prefix, affects persistent
purpose quota, or crosses a source generation.

For a bad output or suspected metadata leak:

1. make the exact rendition inaccessible by moving it to the legal cleanup
   lifecycle (or detach/reject the canonical source through its accepted
   service);
2. keep the original READY path only when the source remains safe;
3. disconnect any later invocation runtime if the fault may repeat;
4. inspect safe error/job evidence and exact provider-object state;
5. let the bounded deletion job remove only the derived key;
6. regenerate only from the still-current exact source/profile generation.

Do not rewrite historical Order snapshots, manually edit output metadata, or
reuse a failed key. Production transformation remains unavailable while the
storage provider is `NOT_CONFIGURED`; the staging deterministic adapter is not
a production provider.
