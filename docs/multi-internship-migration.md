# Multi-internship migration runbook (not executed against production)

The previous schema used a unique partial index on student/status for active
enrollments. The current schema uses student/domain, partial on status=Enrolled.
Mongoose initialization creates indexes but does not remove obsolete ones. Both
indexes may coexist and the old index will still reject a second domain.
Historical admin assignments may lack domain, month, year and enrolledAt.

1. Schedule a maintenance window and stop enrollment/admin-transfer/payment
   writers. Take a restorable backup of enrollments, batches and index definitions.
   Use the actual collection names and `listIndexes()`; do not assume an index name.
2. Read every enrollment, referenced batch and actual index definition. Feed these
   arrays to `enrollmentMigrationPlan` in `server/services/enrollment-migration-plan.js`.
   It is a pure dry-run planner and performs no database operations.
3. Stop if blockers are reported: missing batches, unknown domains, domain/batch
   conflicts, or duplicate active student/domain records. Resolve these manually
   against payment/order history. Never merge payments, delete paid history, or
   mark records Paid as part of this migration. Do not infer domain from the
   student's registered domain.
4. Backfill only the canonical domain derived from each batch. Use compare-and-set
   updates by `_id`, batch and the original domain (including `$exists:false` for
   missing fields). Abort if any write fails to match. Preserve all payment,
   lifecycle, batch counter and audit fields. Month/year/enrolledAt are optional;
   they are not required for this migration and must not be fabricated.
5. Rerun the planner. Require no blockers and no outstanding backfills. Create
   `{student:1,domain:1}` with `unique:true` and
   `partialFilterExpression:{status:'Enrolled'}` if absent. Inspect and confirm its
   exact key and options. A conflicting same-name index needs manual review;
   never automatically drop it.
6. Only after the replacement index is confirmed, drop the exact obsolete index
   names reported by the planner. Do not call `syncIndexes()` or drop unrelated
   indexes. Run the planner again: no backfill, blockers, create or drop actions
   should remain. This makes a repeated migration a no-op.
7. Verify same-domain duplicates fail and distinct domains succeed in a disposable
   environment restored from a sanitized backup. Then resume compatible writers.
   This workspace's migration tests exercise the index transition on disposable
   loopback MongoDB only.

Rollback: keep the replacement index. Once multiple active domains exist, the old
unique index cannot be restored without violating valid records. Roll back code
only to a compatible version, or keep enrollment writes paused while preparing a
forward fix. Do not delete enrollments to force the old index back into place.

Runtime legacy reads use the referenced batch domain and reject conflicting
denormalized domains. Run this migration before enabling concurrent production
enrollment writers; legacy records without canonical domains cannot rely on the
new unique index alone to prevent duplicate creation.
