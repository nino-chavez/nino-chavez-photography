-- Counter rows as the deployed schema holds them, before reasons existed: Oct 2, 2026's real totals, five days ago.
-- Runs before the migration inside the rehearsal's rolled-back transaction.
DELETE FROM public.analytics_collection_delivery_counters;
INSERT INTO public.analytics_collection_delivery_counters(bucket_date,schema_version,outcome,count) VALUES
 ((now() AT TIME ZONE 'America/Chicago')::date-5,2,'rejected',24882),
 ((now() AT TIME ZONE 'America/Chicago')::date-5,2,'accepted',682),
 ((now() AT TIME ZONE 'America/Chicago')::date-5,2,'duplicate',3);
