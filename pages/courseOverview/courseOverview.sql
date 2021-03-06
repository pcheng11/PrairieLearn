-- BLOCK select_course_info
WITH
select_course_users AS (
    SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'user_id', u.user_id,
            'uid', u.uid,
            'name', u.name,
            'course_role', cp.course_role
        ) ORDER BY u.uid, u.user_id), '[]'::jsonb) AS course_users
    FROM
        course_permissions AS cp
        JOIN users AS u ON (u.user_id = cp.user_id)
    WHERE
        cp.course_id = $course_id
),
select_assessment_sets AS (
    SELECT
        coalesce(jsonb_agg(to_jsonb(aset.*) ORDER BY aset.number), '[]'::jsonb) AS assessment_sets
    FROM
        assessment_sets AS aset
    WHERE
        aset.course_id = $course_id
),
select_topics AS (
    SELECT
        coalesce(jsonb_agg(to_jsonb(topic.*) ORDER BY topic.number), '[]'::jsonb) AS topics
    FROM
        topics AS topic
    WHERE
        topic.course_id = $course_id
),
select_tags AS (
    SELECT
        coalesce(jsonb_agg(to_jsonb(tag.*) ORDER BY tag.number), '[]'::jsonb) AS tags
    FROM
        tags AS tag
    WHERE
        tag.course_id = $course_id
),
select_grading_jobs AS (
    SELECT
        gj.*
    FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE
        ci.id = $course_id
),
select_grading_jobs_day AS (
    SELECT *
    FROM select_grading_jobs
    WHERE grading_requested_at >= NOW() - '1 day'::INTERVAL
),
select_grading_jobs_week AS (
    SELECT *
    FROM select_grading_jobs
    WHERE grading_requested_at >= NOW() - '1 week'::INTERVAL
),
select_grading_jobs_stats_day_all AS (
    SELECT
        COUNT(id) AS total
    FROM
        select_grading_jobs_day
),
select_grading_jobs_stats_day_completed AS (
    SELECT
        COUNT(id) AS completed,
        AVG(EXTRACT(EPOCH FROM (graded_at - grading_requested_at))) AS duration
    FROM
        select_grading_jobs_day
    WHERE
        graded_at IS NOT NULL
),
select_grading_jobs_stats_day AS (
    SELECT row_to_json(row) AS stats
    FROM (
        SELECT
            select_grading_jobs_stats_day_all.total,
            select_grading_jobs_stats_day_completed.completed,
            select_grading_jobs_stats_day_completed.duration
        FROM
            select_grading_jobs_stats_day_all,
            select_grading_jobs_stats_day_completed
    ) row
),
select_grading_jobs_stats_week_all AS (
    SELECT
        COUNT(id) AS total
    FROM
        select_grading_jobs_week
),
select_grading_jobs_stats_week_completed AS (
    SELECT
        COUNT(id) AS completed,
        AVG(EXTRACT(EPOCH FROM (graded_at - grading_requested_at))) AS duration
    FROM
        select_grading_jobs_week
    WHERE
        graded_at IS NOT NULL
),
select_grading_jobs_stats_week AS (
    SELECT row_to_json(row) AS stats
    FROM (
        SELECT
            select_grading_jobs_stats_week_all.total,
            select_grading_jobs_stats_week_completed.completed,
            select_grading_jobs_stats_week_completed.duration
        FROM
            select_grading_jobs_stats_week_all,
            select_grading_jobs_stats_week_completed
    ) row
),
select_grading_jobs_stats_all_all AS (
    SELECT
        COUNT(id) AS total
    FROM
        select_grading_jobs
),
select_grading_jobs_stats_all_completed AS (
    SELECT
        COUNT(id) AS completed,
        AVG(EXTRACT(EPOCH FROM (graded_at - grading_requested_at))) AS duration
    FROM
        select_grading_jobs
    WHERE
        graded_at IS NOT NULL
),
select_grading_jobs_stats_all AS (
    SELECT row_to_json(row) AS stats
    FROM (
        SELECT
            select_grading_jobs_stats_all_all.total,
            select_grading_jobs_stats_all_completed.completed,
            select_grading_jobs_stats_all_completed.duration
        FROM
            select_grading_jobs_stats_all_all,
            select_grading_jobs_stats_all_completed
    ) row
)
SELECT
    select_course_users.course_users,
    select_assessment_sets.assessment_sets,
    select_topics.topics,
    select_tags.tags,
    select_grading_jobs_stats_day.stats AS external_grading_stats_day,
    select_grading_jobs_stats_week.stats AS external_grading_stats_week,
    select_grading_jobs_stats_all.stats AS external_grading_stats_all
FROM
    select_course_users,
    select_assessment_sets,
    select_topics,
    select_tags,
    select_grading_jobs_stats_day,
    select_grading_jobs_stats_week,
    select_grading_jobs_stats_all;
