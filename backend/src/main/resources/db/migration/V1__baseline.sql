--
-- PostgreSQL database dump
--


-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: fill_chip_id_from_plan(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_chip_id_from_plan() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.chip_id IS NULL AND NEW.plan_id IS NOT NULL THEN
    SELECT chip_id INTO NEW.chip_id FROM evaluation_plans WHERE id = NEW.plan_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_chip_report_to_eval_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_chip_report_to_eval_report() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO evaluation_reports (report_no, report_type, summary, score, created_at, title, status)
    VALUES (
        NEW.report_no,
        'CHIP',
        COALESCE(NEW.bottleneck_analysis, ''),
        NEW.overall_score,
        NEW.created_at,
        'Report-' || NEW.report_no,
        CASE WHEN NEW.status = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'DRAFT' END
    )
    ON CONFLICT (report_no) DO UPDATE SET
        summary = EXCLUDED.summary,
        score = EXCLUDED.score,
        status = EXCLUDED.status;
    RETURN NEW;
END;
$$;


--
-- Name: sync_password_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_password_columns() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.password_hash IS NOT NULL AND (NEW.password IS NULL OR NEW.password != NEW.password_hash) THEN
        NEW.password = NEW.password_hash;
    END IF;
    IF NEW.password IS NOT NULL AND (NEW.password_hash IS NULL OR NEW.password_hash != NEW.password) THEN
        NEW.password_hash = NEW.password;
    END IF;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id bigint NOT NULL,
    alert_type character varying(32) DEFAULT 'SYSTEM'::character varying,
    severity character varying(16) DEFAULT 'INFO'::character varying,
    title character varying(256) DEFAULT ''::character varying,
    content text DEFAULT ''::text,
    task_id bigint,
    user_id bigint,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    read_at timestamp without time zone,
    acknowledged_at timestamp(6) with time zone,
    acknowledged_by bigint,
    node_id bigint,
    node_name character varying(100),
    updated_at timestamp(6) with time zone,
    level character varying(32) DEFAULT 'INFO'::character varying,
    message text,
    rule_name character varying(255),
    status character varying(32) DEFAULT 'ACTIVE'::character varying
);


--
-- Name: alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alerts_id_seq OWNED BY public.alerts.id;


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    id bigint NOT NULL,
    title character varying(200) NOT NULL,
    content text,
    summary character varying(500),
    category character varying(32),
    status character varying(32) DEFAULT 'DRAFT'::character varying,
    view_count integer DEFAULT 0,
    like_count integer DEFAULT 0,
    comment_count integer DEFAULT 0,
    is_pinned boolean DEFAULT false,
    author_id bigint NOT NULL,
    author_name character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: articles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.articles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.articles_id_seq OWNED BY public.articles.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    user_id bigint,
    username character varying(50),
    action character varying(50) NOT NULL,
    resource_type character varying(50),
    resource_id bigint,
    detail text,
    ip_address character varying(50),
    user_agent character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: chip_daily_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chip_daily_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chip_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chip_reports (
    id bigint NOT NULL,
    bottleneck_analysis text,
    chip_id bigint NOT NULL,
    created_at timestamp(6) with time zone,
    created_by bigint,
    dimension_scores jsonb,
    operator_ranking jsonb,
    overall_score double precision,
    plan_id bigint NOT NULL,
    radar_data jsonb,
    report_no character varying(64) NOT NULL,
    scenario_recommendations jsonb,
    status character varying(16) NOT NULL,
    updated_at timestamp(6) with time zone,
    recommendations jsonb,
    visibility character varying(16) DEFAULT 'PRIVATE'::character varying,
    deleted_at timestamp(6) with time zone,
    archived boolean DEFAULT false NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    is_baseline boolean DEFAULT false,
    execution_node_name character varying(200),
    execution_node_ip character varying(64),
    actual_chip_model character varying(200),
    training_summary jsonb,
    inference_summary jsonb,
    baseline_chip character varying(200),
    execution_environment jsonb,
    coverage text,
    baseline_source jsonb,
    CONSTRAINT chip_reports_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PUBLISHED'::character varying])::text[]))),
    CONSTRAINT chip_reports_visibility_check CHECK (((visibility)::text = ANY (ARRAY['PRIVATE'::text, 'TENANT'::text, 'PLATFORM'::text, 'PUBLIC'::text])))
);


--
-- Name: chip_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chip_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chip_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chip_reports_id_seq OWNED BY public.chip_reports.id;


--
-- Name: chips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chips (
    id bigint NOT NULL,
    capability_profile jsonb,
    chip_no character varying(32) NOT NULL,
    chip_type character varying(16) NOT NULL,
    created_at timestamp(6) with time zone,
    created_by bigint NOT NULL,
    manufacturer character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    remark character varying(255),
    software_stack jsonb,
    status character varying(16) NOT NULL,
    tags character varying(255),
    tech_spec jsonb,
    updated_at timestamp(6) with time zone,
    profile_data jsonb,
    tenant_id bigint,
    architecture character varying(100),
    generation character varying(100),
    model_name character varying(200),
    peak_bandwidth_gbps double precision,
    peak_gflops_fp16 double precision,
    peak_gflops_fp32 double precision,
    fp64_tflops double precision,
    bf16_tflops double precision,
    tf32_tflops double precision,
    fp8_tflops double precision,
    int8_tops double precision,
    memory_gb double precision,
    memory_type character varying(20),
    memory_bandwidth_tbps double precision,
    interconnect_bandwidth_gbps double precision,
    interconnect_type character varying(50),
    tdp_watts integer,
    process_node character varying(20),
    supported_precisions character varying(200),
    default_baseline_plan_id bigint,
    CONSTRAINT chips_chip_type_check CHECK (((chip_type)::text = ANY (ARRAY['GPU'::text, 'NPU'::text, 'TPU'::text, 'CPU'::text, 'FPGA'::text, 'ASIC'::text, 'OTHER'::text]))),
    CONSTRAINT chips_status_check CHECK (((status)::text = ANY (ARRAY['REGISTERED'::text, 'CONFIGURING'::text, 'READY'::text, 'EVALUATING'::text, 'EVALUATED'::text, 'EVAL_FAILED'::text, 'ARCHIVED'::text, 'UNEVALUATED'::text])))
);


--
-- Name: chips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chips_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chips_id_seq OWNED BY public.chips.id;


--
-- Name: community_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_resources (
    id bigint NOT NULL,
    category character varying(32) NOT NULL,
    created_at timestamp(6) with time zone,
    created_by bigint,
    description text,
    download_count integer NOT NULL,
    file_name character varying(255),
    file_path character varying(255),
    file_size bigint,
    name character varying(255) NOT NULL,
    updated_at timestamp(6) with time zone,
    CONSTRAINT community_resources_category_check CHECK (((category)::text = ANY ((ARRAY['BENCHMARK_IMAGE'::character varying, 'EVAL_SCRIPT'::character varying, 'BASELINE_DATA'::character varying, 'BEST_PRACTICE'::character varying, 'REPORT_TEMPLATE'::character varying])::text[])))
);


--
-- Name: community_resources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_resources_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_resources_id_seq OWNED BY public.community_resources.id;


--
-- Name: comparison_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comparison_records (
    id bigint NOT NULL,
    comparison_no character varying(64) NOT NULL,
    title character varying(200) NOT NULL,
    description character varying(500),
    report_ids character varying(500),
    compare_type character varying(32),
    comparison_result jsonb,
    chart_config jsonb,
    created_by bigint NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: comparison_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comparison_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comparison_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comparison_records_id_seq OWNED BY public.comparison_records.id;


--
-- Name: comparison_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comparison_results (
    id bigint NOT NULL,
    baseline_report_id bigint NOT NULL,
    created_at timestamp(6) with time zone,
    created_by bigint,
    dimension_vs_pcts jsonb,
    operator_comparisons jsonb,
    overall_vs_pct double precision,
    summary text,
    test_report_ids character varying(512) NOT NULL
);


--
-- Name: comparison_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comparison_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comparison_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comparison_results_id_seq OWNED BY public.comparison_results.id;


--
-- Name: compute_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compute_nodes (
    id bigint NOT NULL,
    agent_port integer,
    created_at timestamp(6) with time zone,
    description character varying(500),
    hardware_info jsonb,
    ip_address character varying(64),
    last_heartbeat timestamp(6) with time zone,
    name character varying(100) NOT NULL,
    status character varying(32) NOT NULL,
    tags character varying(200),
    updated_at timestamp(6) with time zone,
    error_message character varying(1000),
    ssh_auth_type character varying(16),
    ssh_port integer,
    ssh_user character varying(64),
    env_info jsonb,
    ssh_key text,
    resource_pool_id bigint,
    cluster_id bigint,
    source character varying(50),
    chip_model character varying(200),
    consecutive_unreachable_count integer DEFAULT 0,
    gpu_count integer DEFAULT 0
);


--
-- Name: compute_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compute_nodes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compute_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compute_nodes_id_seq OWNED BY public.compute_nodes.id;


--
-- Name: compute_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compute_resources (
    id bigint NOT NULL,
    resource_no character varying(64) NOT NULL,
    name character varying(200) NOT NULL,
    resource_type character varying(32) NOT NULL,
    model character varying(100),
    vendor character varying(100),
    total_count integer DEFAULT 0,
    available_count integer DEFAULT 0,
    status character varying(32) DEFAULT 'ONLINE'::character varying,
    pool_name character varying(100),
    specs jsonb,
    utilization jsonb,
    created_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: compute_resources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compute_resources_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compute_resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compute_resources_id_seq OWNED BY public.compute_resources.id;


--
-- Name: datasets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.datasets (
    id bigint NOT NULL,
    name character varying(128) NOT NULL,
    description text,
    type character varying(32) NOT NULL,
    format character varying(32),
    size_bytes bigint,
    sample_count integer,
    file_path character varying(512),
    is_system boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: datasets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.datasets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: datasets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.datasets_id_seq OWNED BY public.datasets.id;


--
-- Name: digital_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_assets (
    id bigint NOT NULL,
    asset_no character varying(64) NOT NULL,
    name character varying(200) NOT NULL,
    asset_type character varying(32) NOT NULL,
    description character varying(500),
    version character varying(32),
    file_path character varying(512),
    file_size bigint,
    mime_type character varying(100),
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    tags jsonb,
    metadata jsonb,
    download_count integer DEFAULT 0,
    created_by bigint NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    file_format character varying(32),
    source_url character varying(512)
);


--
-- Name: digital_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.digital_assets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: digital_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.digital_assets_id_seq OWNED BY public.digital_assets.id;


--
-- Name: eval_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_logs (
    id bigint NOT NULL,
    task_id bigint,
    log_level character varying(16) DEFAULT 'INFO'::character varying,
    message text,
    source character varying(200),
    step_name character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: eval_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eval_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eval_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eval_logs_id_seq OWNED BY public.eval_logs.id;


--
-- Name: evaluation_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_metrics (
    id bigint NOT NULL,
    metric_key character varying(64) NOT NULL,
    metric_name character varying(128) NOT NULL,
    category character varying(32) NOT NULL,
    unit character varying(32),
    data_type character varying(16) DEFAULT 'FLOAT'::character varying NOT NULL,
    description text,
    eval_types character varying(64)[] DEFAULT '{}'::character varying[],
    display_format character varying(32) DEFAULT '%.2f'::character varying,
    is_key_metric boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: evaluation_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_metrics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_metrics_id_seq OWNED BY public.evaluation_metrics.id;


--
-- Name: evaluation_object_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_object_versions (
    id bigint NOT NULL,
    object_id bigint NOT NULL,
    version character varying(32) NOT NULL,
    description text,
    file_reference character varying(512),
    parent_version_id bigint,
    status character varying(32) DEFAULT 'PUBLISHED'::character varying NOT NULL,
    created_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: evaluation_object_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_object_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_object_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_object_versions_id_seq OWNED BY public.evaluation_object_versions.id;


--
-- Name: evaluation_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_objects (
    id bigint NOT NULL,
    name character varying(128) NOT NULL,
    type character varying(32) NOT NULL,
    framework character varying(64),
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: evaluation_objects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_objects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_objects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_objects_id_seq OWNED BY public.evaluation_objects.id;


--
-- Name: evaluation_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_plans (
    id bigint NOT NULL,
    chip_id bigint NOT NULL,
    completed_at timestamp(6) with time zone,
    completed_tasks integer,
    created_at timestamp(6) with time zone,
    created_by bigint NOT NULL,
    description character varying(255),
    eval_config jsonb,
    name character varying(255) NOT NULL,
    node_id bigint,
    plan_no character varying(32) NOT NULL,
    progress integer,
    started_at timestamp(6) with time zone,
    status character varying(16) NOT NULL,
    total_tasks integer,
    updated_at timestamp(6) with time zone,
    template_id bigint,
    run_spec_id bigint,
    CONSTRAINT evaluation_plans_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'RUNNING'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: evaluation_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_plans_id_seq OWNED BY public.evaluation_plans.id;


--
-- Name: evaluation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_reports (
    id bigint NOT NULL,
    report_no character varying(64) NOT NULL,
    task_id bigint,
    report_type character varying(32),
    summary text,
    metrics jsonb,
    charts jsonb,
    pdf_path character varying(512),
    html_path character varying(512),
    is_public boolean DEFAULT false,
    share_token character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    title character varying(200),
    eval_type character varying(32),
    status character varying(32) DEFAULT 'DRAFT'::character varying,
    score double precision,
    chart_data jsonb,
    created_by bigint,
    reviewed_by bigint,
    published_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    version character varying(16) DEFAULT 'v1.0'::character varying,
    version_history jsonb DEFAULT '[]'::jsonb,
    share_expires_at timestamp without time zone,
    share_password character varying(64),
    json_path character varying(512)
);


--
-- Name: evaluation_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_reports_id_seq OWNED BY public.evaluation_reports.id;


--
-- Name: evaluation_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_results (
    id bigint NOT NULL,
    chip_id bigint,
    created_at timestamp(6) with time zone,
    error_message text,
    metrics_summary jsonb,
    passed boolean,
    plan_id bigint,
    raw_data jsonb,
    task_id bigint NOT NULL,
    data_status character varying(16)
);


--
-- Name: evaluation_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_results_id_seq OWNED BY public.evaluation_results.id;


--
-- Name: evaluation_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_tasks (
    id bigint NOT NULL,
    task_no character varying(64) NOT NULL,
    task_type character varying(32),
    eval_type character varying(32),
    status character varying(32) DEFAULT 'PENDING'::character varying NOT NULL,
    priority character varying(16) DEFAULT 'MEDIUM'::character varying NOT NULL,
    eval_config jsonb,
    dataset_ids bigint[],
    resource_spec jsonb,
    allocated_resources jsonb,
    resource_pool_id bigint,
    progress integer DEFAULT 0,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_by bigint NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    tags character varying(500),
    error_message text,
    config jsonb,
    description character varying(500),
    result jsonb,
    target_model character varying(100),
    name character varying(200),
    object_id bigint,
    object_version_id bigint,
    template_id bigint,
    timeout_minutes integer DEFAULT 30,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 0,
    retry_from_task_id bigint,
    cancel_reason text,
    eval_object character varying(32),
    chip_id bigint,
    plan_id bigint,
    test_item character varying(64),
    test_subject character varying(16),
    dimension character varying(32),
    parent_task_id bigint,
    force_run boolean DEFAULT false,
    version bigint DEFAULT 0,
    assigned_node_id bigint,
    last_heartbeat_at timestamp(6) with time zone,
    timeout_seconds integer,
    queue_reason character varying(500),
    run_spec_id bigint,
    run_spec_code character varying(64),
    queue_position integer,
    estimated_wait_minutes integer,
    allocated_gpu_indices character varying(200),
    last_progress_update_at timestamp(6) with time zone,
    failure_type character varying(32),
    CONSTRAINT evaluation_tasks_failure_type_check CHECK (((failure_type)::text = ANY ((ARRAY['TIMEOUT_NOT_STARTED'::character varying, 'TIMEOUT_IN_PROGRESS'::character varying, 'AGENT_ERROR'::character varying, 'EVAL_FAILED'::character varying])::text[]))),
    CONSTRAINT evaluation_tasks_test_subject_check CHECK (((test_subject)::text = ANY (ARRAY['OPERATOR'::text, 'MODEL'::text, 'CHIP'::text, 'LLM'::text, 'TRAINING'::text])))
);


--
-- Name: evaluation_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_tasks_id_seq OWNED BY public.evaluation_tasks.id;




--
-- Name: gpu_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gpu_slots (
    id bigint NOT NULL,
    node_id bigint NOT NULL,
    gpu_index integer NOT NULL,
    gpu_model character varying(200),
    gpu_memory_gb integer,
    status character varying(16) DEFAULT 'FREE'::character varying NOT NULL,
    allocated_task_id bigint,
    allocated_at timestamp without time zone,
    version bigint DEFAULT 0 NOT NULL
);


--
-- Name: gpu_slots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gpu_slots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gpu_slots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gpu_slots_id_seq OWNED BY public.gpu_slots.id;


--
-- Name: k8s_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.k8s_clusters (
    id bigint NOT NULL,
    api_server_url character varying(500),
    created_at timestamp(6) without time zone,
    error_message text,
    kubeconfig text NOT NULL,
    name character varying(200) NOT NULL,
    node_count integer,
    online_count integer,
    status character varying(50),
    updated_at timestamp(6) without time zone
);


--
-- Name: k8s_clusters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.k8s_clusters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: k8s_clusters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.k8s_clusters_id_seq OWNED BY public.k8s_clusters.id;


--
-- Name: node_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_metrics (
    id bigint NOT NULL,
    cpu_percent double precision,
    disk_used_percent double precision,
    load_15m double precision,
    load_1m double precision,
    load_5m double precision,
    memory_available_gb double precision,
    memory_used_gb double precision,
    memory_used_percent double precision,
    node_id bigint NOT NULL,
    recorded_at timestamp(6) with time zone
);


--
-- Name: node_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_metrics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_metrics_id_seq OWNED BY public.node_metrics.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    title character varying(200) NOT NULL,
    content text,
    notify_type character varying(32) DEFAULT 'SYSTEM'::character varying,
    is_read boolean DEFAULT false,
    ref_type character varying(32),
    ref_id bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: resource_pools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_pools (
    id bigint NOT NULL,
    name character varying(128) NOT NULL,
    type character varying(32) NOT NULL,
    description text,
    capacity jsonb NOT NULL,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    chip_model character varying(200),
    provider character varying(32) DEFAULT 'bare-metal'::character varying,
    cluster_id bigint,
    gpu_per_node integer,
    scheduling_policy character varying(32) DEFAULT 'least_loaded'::character varying,
    max_concurrent_tasks integer DEFAULT 0,
    priority integer DEFAULT 0
);


--
-- Name: resource_pools_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resource_pools_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resource_pools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resource_pools_id_seq OWNED BY public.resource_pools.id;


--
-- Name: resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources (
    id bigint NOT NULL,
    pool_id bigint NOT NULL,
    node_name character varying(128) NOT NULL,
    cpu_cores integer NOT NULL,
    memory_gb integer NOT NULL,
    gpu_model character varying(64),
    gpu_count integer DEFAULT 0,
    status character varying(32) DEFAULT 'IDLE'::character varying NOT NULL,
    current_tasks bigint[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: resources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resources_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resources_id_seq OWNED BY public.resources.id;


--
-- Name: run_specs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run_specs (
    id bigint NOT NULL,
    name character varying(128) NOT NULL,
    code character varying(64) NOT NULL,
    node_count integer DEFAULT 1 NOT NULL,
    gpu_per_node integer DEFAULT 0 NOT NULL,
    gpu_exclusive boolean DEFAULT false,
    cpu_cores integer,
    cpu_exclusive boolean DEFAULT false,
    memory_gb integer,
    parallel_mode character varying(32),
    category character varying(32) NOT NULL,
    description text,
    is_system boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: run_specs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.run_specs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: run_specs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.run_specs_id_seq OWNED BY public.run_specs.id;


--
-- Name: task_environments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_environments (
    id bigint NOT NULL,
    task_id bigint NOT NULL,
    cpu_model character varying(128),
    cpu_cores integer,
    memory_gb integer,
    os_info character varying(128),
    python_version character varying(16),
    framework_name character varying(64),
    framework_version character varying(32),
    extra_packages jsonb DEFAULT '[]'::jsonb,
    env_variables jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: task_environments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_environments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_environments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_environments_id_seq OWNED BY public.task_environments.id;


--
-- Name: task_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_executions (
    id bigint NOT NULL,
    completed_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone,
    dispatched_at timestamp(6) with time zone,
    duration_sec double precision,
    logs text,
    node_id bigint NOT NULL,
    result jsonb,
    started_at timestamp(6) with time zone,
    status character varying(32) NOT NULL,
    task_id bigint NOT NULL,
    updated_at timestamp(6) with time zone
);


--
-- Name: task_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_executions_id_seq OWNED BY public.task_executions.id;


--
-- Name: task_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_logs (
    id bigint NOT NULL,
    task_id bigint NOT NULL,
    level character varying(16) NOT NULL,
    message text NOT NULL,
    details jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    content text,
    context jsonb,
    log_type character varying(16),
    metrics jsonb,
    source character varying(32),
    plan_id bigint,
    node_id character varying(100),
    sequence bigint NOT NULL
);


--
-- Name: task_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_logs_id_seq OWNED BY public.task_logs.id;


--
-- Name: task_logs_sequence_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_logs_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_logs_sequence_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_logs_sequence_seq OWNED BY public.task_logs.sequence;


--
-- Name: task_node_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_node_allocations (
    id bigint NOT NULL,
    task_id bigint NOT NULL,
    node_id bigint NOT NULL,
    node_rank integer DEFAULT 0 NOT NULL,
    gpu_indices integer[],
    status character varying(16) DEFAULT 'ALLOCATED'::character varying,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    result_summary jsonb
);


--
-- Name: task_node_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_node_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_node_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_node_allocations_id_seq OWNED BY public.task_node_allocations.id;


--
-- Name: task_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_templates (
    id bigint NOT NULL,
    name character varying(128) NOT NULL,
    description text,
    eval_type character varying(32) NOT NULL,
    config_json jsonb NOT NULL,
    is_system boolean DEFAULT false,
    created_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    evaluation_layer character varying(32),
    version character varying(32) DEFAULT '1.0'::character varying,
    fork_from bigint,
    changelog text,
    version_notes character varying(500)
);


--
-- Name: task_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_templates_id_seq OWNED BY public.task_templates.id;


--
-- Name: template_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_metrics (
    template_id bigint NOT NULL,
    metric_id bigint NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id bigint NOT NULL,
    name character varying(128) NOT NULL,
    description text,
    resource_quota jsonb,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    code character varying(50),
    contact_email character varying(255)
);


--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenants_id_seq OWNED BY public.tenants.id;


--
-- Name: user_tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tenants (
    user_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    role character varying(32) DEFAULT 'MEMBER'::character varying NOT NULL,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    username character varying(64) NOT NULL,
    email character varying(128) NOT NULL,
    phone character varying(20),
    password_hash character varying(256),
    user_type character varying(32) DEFAULT 'INDIVIDUAL'::character varying NOT NULL,
    avatar_url character varying(512),
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    email_verified boolean DEFAULT false,
    phone_verified boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    avatar character varying(200),
    last_login_at timestamp(6) with time zone,
    tenant_id bigint,
    password character varying(255),
    role character varying(20),
    org character varying(128),
    organization character varying(200),
    failed_attempts integer DEFAULT 0,
    locked_until timestamp without time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id bigint NOT NULL,
    workflow_no character varying(64) NOT NULL,
    name character varying(200) NOT NULL,
    description character varying(500),
    status character varying(32) DEFAULT 'DRAFT'::character varying,
    steps jsonb,
    trigger_config jsonb,
    created_by bigint NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflows_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflows_id_seq OWNED BY public.workflows.id;


--
-- Name: alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts ALTER COLUMN id SET DEFAULT nextval('public.alerts_id_seq'::regclass);


--
-- Name: articles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles ALTER COLUMN id SET DEFAULT nextval('public.articles_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: chip_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_reports ALTER COLUMN id SET DEFAULT nextval('public.chip_reports_id_seq'::regclass);


--
-- Name: chips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chips ALTER COLUMN id SET DEFAULT nextval('public.chips_id_seq'::regclass);


--
-- Name: community_resources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_resources ALTER COLUMN id SET DEFAULT nextval('public.community_resources_id_seq'::regclass);


--
-- Name: comparison_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparison_records ALTER COLUMN id SET DEFAULT nextval('public.comparison_records_id_seq'::regclass);


--
-- Name: comparison_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparison_results ALTER COLUMN id SET DEFAULT nextval('public.comparison_results_id_seq'::regclass);


--
-- Name: compute_nodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compute_nodes ALTER COLUMN id SET DEFAULT nextval('public.compute_nodes_id_seq'::regclass);


--
-- Name: compute_resources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compute_resources ALTER COLUMN id SET DEFAULT nextval('public.compute_resources_id_seq'::regclass);


--
-- Name: datasets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasets ALTER COLUMN id SET DEFAULT nextval('public.datasets_id_seq'::regclass);


--
-- Name: digital_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_assets ALTER COLUMN id SET DEFAULT nextval('public.digital_assets_id_seq'::regclass);


--
-- Name: eval_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_logs ALTER COLUMN id SET DEFAULT nextval('public.eval_logs_id_seq'::regclass);


--
-- Name: evaluation_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_metrics ALTER COLUMN id SET DEFAULT nextval('public.evaluation_metrics_id_seq'::regclass);


--
-- Name: evaluation_object_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_object_versions ALTER COLUMN id SET DEFAULT nextval('public.evaluation_object_versions_id_seq'::regclass);


--
-- Name: evaluation_objects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_objects ALTER COLUMN id SET DEFAULT nextval('public.evaluation_objects_id_seq'::regclass);


--
-- Name: evaluation_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_plans ALTER COLUMN id SET DEFAULT nextval('public.evaluation_plans_id_seq'::regclass);


--
-- Name: evaluation_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_reports ALTER COLUMN id SET DEFAULT nextval('public.evaluation_reports_id_seq'::regclass);


--
-- Name: evaluation_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_results ALTER COLUMN id SET DEFAULT nextval('public.evaluation_results_id_seq'::regclass);


--
-- Name: evaluation_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_tasks ALTER COLUMN id SET DEFAULT nextval('public.evaluation_tasks_id_seq'::regclass);


--
-- Name: gpu_slots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gpu_slots ALTER COLUMN id SET DEFAULT nextval('public.gpu_slots_id_seq'::regclass);


--
-- Name: k8s_clusters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.k8s_clusters ALTER COLUMN id SET DEFAULT nextval('public.k8s_clusters_id_seq'::regclass);


--
-- Name: node_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_metrics ALTER COLUMN id SET DEFAULT nextval('public.node_metrics_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: resource_pools id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_pools ALTER COLUMN id SET DEFAULT nextval('public.resource_pools_id_seq'::regclass);


--
-- Name: resources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources ALTER COLUMN id SET DEFAULT nextval('public.resources_id_seq'::regclass);


--
-- Name: run_specs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_specs ALTER COLUMN id SET DEFAULT nextval('public.run_specs_id_seq'::regclass);


--
-- Name: task_environments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_environments ALTER COLUMN id SET DEFAULT nextval('public.task_environments_id_seq'::regclass);


--
-- Name: task_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_executions ALTER COLUMN id SET DEFAULT nextval('public.task_executions_id_seq'::regclass);


--
-- Name: task_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_logs ALTER COLUMN id SET DEFAULT nextval('public.task_logs_id_seq'::regclass);


--
-- Name: task_logs sequence; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_logs ALTER COLUMN sequence SET DEFAULT nextval('public.task_logs_sequence_seq'::regclass);


--
-- Name: task_node_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_node_allocations ALTER COLUMN id SET DEFAULT nextval('public.task_node_allocations_id_seq'::regclass);


--
-- Name: task_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_templates ALTER COLUMN id SET DEFAULT nextval('public.task_templates_id_seq'::regclass);


--
-- Name: tenants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants ALTER COLUMN id SET DEFAULT nextval('public.tenants_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: workflows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows ALTER COLUMN id SET DEFAULT nextval('public.workflows_id_seq'::regclass);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: chip_reports chip_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_reports
    ADD CONSTRAINT chip_reports_pkey PRIMARY KEY (id);


--
-- Name: chips chips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chips
    ADD CONSTRAINT chips_pkey PRIMARY KEY (id);


--
-- Name: community_resources community_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_resources
    ADD CONSTRAINT community_resources_pkey PRIMARY KEY (id);


--
-- Name: comparison_records comparison_records_comparison_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparison_records
    ADD CONSTRAINT comparison_records_comparison_no_key UNIQUE (comparison_no);


--
-- Name: comparison_records comparison_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparison_records
    ADD CONSTRAINT comparison_records_pkey PRIMARY KEY (id);


--
-- Name: comparison_results comparison_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparison_results
    ADD CONSTRAINT comparison_results_pkey PRIMARY KEY (id);


--
-- Name: compute_nodes compute_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compute_nodes
    ADD CONSTRAINT compute_nodes_pkey PRIMARY KEY (id);


--
-- Name: compute_resources compute_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compute_resources
    ADD CONSTRAINT compute_resources_pkey PRIMARY KEY (id);


--
-- Name: compute_resources compute_resources_resource_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compute_resources
    ADD CONSTRAINT compute_resources_resource_no_key UNIQUE (resource_no);


--
-- Name: datasets datasets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_pkey PRIMARY KEY (id);


--
-- Name: digital_assets digital_assets_asset_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_assets
    ADD CONSTRAINT digital_assets_asset_no_key UNIQUE (asset_no);


--
-- Name: digital_assets digital_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_assets
    ADD CONSTRAINT digital_assets_pkey PRIMARY KEY (id);


--
-- Name: eval_logs eval_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_logs
    ADD CONSTRAINT eval_logs_pkey PRIMARY KEY (id);


--
-- Name: evaluation_metrics evaluation_metrics_metric_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_metrics
    ADD CONSTRAINT evaluation_metrics_metric_key_key UNIQUE (metric_key);


--
-- Name: evaluation_metrics evaluation_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_metrics
    ADD CONSTRAINT evaluation_metrics_pkey PRIMARY KEY (id);


--
-- Name: evaluation_object_versions evaluation_object_versions_object_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_object_versions
    ADD CONSTRAINT evaluation_object_versions_object_id_version_key UNIQUE (object_id, version);


--
-- Name: evaluation_object_versions evaluation_object_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_object_versions
    ADD CONSTRAINT evaluation_object_versions_pkey PRIMARY KEY (id);


--
-- Name: evaluation_objects evaluation_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_objects
    ADD CONSTRAINT evaluation_objects_pkey PRIMARY KEY (id);


--
-- Name: evaluation_plans evaluation_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_plans
    ADD CONSTRAINT evaluation_plans_pkey PRIMARY KEY (id);


--
-- Name: evaluation_reports evaluation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_reports
    ADD CONSTRAINT evaluation_reports_pkey PRIMARY KEY (id);


--
-- Name: evaluation_reports evaluation_reports_report_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_reports
    ADD CONSTRAINT evaluation_reports_report_no_key UNIQUE (report_no);


--
-- Name: evaluation_results evaluation_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_results
    ADD CONSTRAINT evaluation_results_pkey PRIMARY KEY (id);


--
-- Name: evaluation_tasks evaluation_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_tasks
    ADD CONSTRAINT evaluation_tasks_pkey PRIMARY KEY (id);




--
-- Name: gpu_slots gpu_slots_node_id_gpu_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gpu_slots
    ADD CONSTRAINT gpu_slots_node_id_gpu_index_key UNIQUE (node_id, gpu_index);


--
-- Name: gpu_slots gpu_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gpu_slots
    ADD CONSTRAINT gpu_slots_pkey PRIMARY KEY (id);


--
-- Name: k8s_clusters k8s_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.k8s_clusters
    ADD CONSTRAINT k8s_clusters_pkey PRIMARY KEY (id);


--
-- Name: node_metrics node_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_metrics
    ADD CONSTRAINT node_metrics_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: resource_pools resource_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_pools
    ADD CONSTRAINT resource_pools_pkey PRIMARY KEY (id);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: run_specs run_specs_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_specs
    ADD CONSTRAINT run_specs_code_key UNIQUE (code);


--
-- Name: run_specs run_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_specs
    ADD CONSTRAINT run_specs_pkey PRIMARY KEY (id);


--
-- Name: task_environments task_environments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_environments
    ADD CONSTRAINT task_environments_pkey PRIMARY KEY (id);


--
-- Name: task_environments task_environments_task_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_environments
    ADD CONSTRAINT task_environments_task_id_key UNIQUE (task_id);


--
-- Name: task_executions task_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_executions
    ADD CONSTRAINT task_executions_pkey PRIMARY KEY (id);


--
-- Name: task_logs task_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_logs
    ADD CONSTRAINT task_logs_pkey PRIMARY KEY (id);


--
-- Name: task_node_allocations task_node_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_node_allocations
    ADD CONSTRAINT task_node_allocations_pkey PRIMARY KEY (id);


--
-- Name: task_node_allocations task_node_allocations_task_id_node_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_node_allocations
    ADD CONSTRAINT task_node_allocations_task_id_node_id_key UNIQUE (task_id, node_id);


--
-- Name: task_templates task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT task_templates_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: k8s_clusters uk_36evivcqenq5qimxaep52y02j; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.k8s_clusters
    ADD CONSTRAINT uk_36evivcqenq5qimxaep52y02j UNIQUE (name);


--
-- Name: compute_nodes uk_5n1vex8b1wda1vb5jsrxs7c04; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compute_nodes
    ADD CONSTRAINT uk_5n1vex8b1wda1vb5jsrxs7c04 UNIQUE (name);


--
-- Name: chip_reports uk_9snkrsmldswigte8doo3x3o8j; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_reports
    ADD CONSTRAINT uk_9snkrsmldswigte8doo3x3o8j UNIQUE (report_no);


--
-- Name: evaluation_plans uk_jyj2u7ajwvr71u7pdc8fvv6fc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_plans
    ADD CONSTRAINT uk_jyj2u7ajwvr71u7pdc8fvv6fc UNIQUE (plan_no);


--
-- Name: chips uk_kwx2kkho2ot3b5ekxw75dua8n; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chips
    ADD CONSTRAINT uk_kwx2kkho2ot3b5ekxw75dua8n UNIQUE (chip_no);


--
-- Name: gpu_slots ukaclca3jtxw3dsmbybqomg9hdr; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gpu_slots
    ADD CONSTRAINT ukaclca3jtxw3dsmbybqomg9hdr UNIQUE (node_id, gpu_index);


--
-- Name: task_node_allocations ukm2sac9d0q1iippvuosrm32u9g; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_node_allocations
    ADD CONSTRAINT ukm2sac9d0q1iippvuosrm32u9g UNIQUE (task_id, node_id);


--
-- Name: user_tenants user_tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_pkey PRIMARY KEY (user_id, tenant_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_workflow_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_workflow_no_key UNIQUE (workflow_no);




--
-- Name: idx_alerts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_type ON public.alerts USING btree (alert_type);


--
-- Name: idx_alerts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_user ON public.alerts USING btree (user_id, is_read);


--
-- Name: idx_articles_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_category ON public.articles USING btree (category);


--
-- Name: idx_articles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_status ON public.articles USING btree (status);


--
-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_status ON public.digital_assets USING btree (status);


--
-- Name: idx_assets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_type ON public.digital_assets USING btree (asset_type);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_chip_reports_chip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chip_reports_chip_id ON public.chip_reports USING btree (chip_id);


--
-- Name: idx_chip_reports_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chip_reports_plan_id ON public.chip_reports USING btree (plan_id);


--
-- Name: idx_chip_reports_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chip_reports_visibility ON public.chip_reports USING btree (visibility);


--
-- Name: idx_chips_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chips_status ON public.chips USING btree (status);


--
-- Name: idx_chips_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chips_tenant_id ON public.chips USING btree (tenant_id);


--
-- Name: idx_comparison_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comparison_user ON public.comparison_records USING btree (created_by);


--
-- Name: idx_datasets_is_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_datasets_is_system ON public.datasets USING btree (is_system);


--
-- Name: idx_datasets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_datasets_type ON public.datasets USING btree (type);


--
-- Name: idx_eval_objects_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eval_objects_name ON public.evaluation_objects USING btree (name);


--
-- Name: idx_eval_objects_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eval_objects_type ON public.evaluation_objects USING btree (type);


--
-- Name: idx_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_created_at ON public.task_logs USING btree (created_at);


--
-- Name: idx_logs_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_level ON public.eval_logs USING btree (log_level);


--
-- Name: idx_logs_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_task ON public.eval_logs USING btree (task_id);


--
-- Name: idx_logs_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_task_id ON public.task_logs USING btree (task_id);


--
-- Name: idx_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_type ON public.task_logs USING btree (log_type);


--
-- Name: idx_nodes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nodes_status ON public.compute_nodes USING btree (status);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_obj_versions_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_obj_versions_object ON public.evaluation_object_versions USING btree (object_id);


--
-- Name: idx_plans_chip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plans_chip ON public.evaluation_plans USING btree (chip_id);


--
-- Name: idx_plans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plans_status ON public.evaluation_plans USING btree (status);


--
-- Name: idx_reports_share_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_share_token ON public.evaluation_reports USING btree (share_token);


--
-- Name: idx_reports_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_task_id ON public.evaluation_reports USING btree (task_id);


--
-- Name: idx_resources_pool_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resources_pool_id ON public.resources USING btree (pool_id);


--
-- Name: idx_resources_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resources_status ON public.resources USING btree (status);


--
-- Name: idx_resources_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resources_type ON public.compute_resources USING btree (resource_type);


--
-- Name: idx_results_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_results_task ON public.evaluation_results USING btree (task_id);


--
-- Name: idx_task_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_logs_created_at ON public.task_logs USING btree (created_at);


--
-- Name: idx_task_logs_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_logs_plan_id ON public.task_logs USING btree (plan_id);


--
-- Name: idx_task_logs_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_logs_task_id ON public.task_logs USING btree (task_id);


--
-- Name: idx_task_logs_task_id_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_logs_task_id_seq ON public.task_logs USING btree (task_id, sequence);


--
-- Name: idx_tasks_chip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_chip_id ON public.evaluation_tasks USING btree (chip_id);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_created_at ON public.evaluation_tasks USING btree (created_at);


--
-- Name: idx_tasks_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_created_by ON public.evaluation_tasks USING btree (created_by);


--
-- Name: idx_tasks_dimension; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_dimension ON public.evaluation_tasks USING btree (dimension);


--
-- Name: idx_tasks_parent_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_parent_task_id ON public.evaluation_tasks USING btree (parent_task_id);


--
-- Name: idx_tasks_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_plan_id ON public.evaluation_tasks USING btree (plan_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.evaluation_tasks USING btree (status);


--
-- Name: idx_tasks_status_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status_priority ON public.evaluation_tasks USING btree (status, priority);


--
-- Name: idx_templates_eval_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_eval_type ON public.task_templates USING btree (eval_type);


--
-- Name: idx_templates_evaluation_layer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_evaluation_layer ON public.task_templates USING btree (evaluation_layer);


--
-- Name: idx_templates_is_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_is_system ON public.task_templates USING btree (is_system);


--
-- Name: idx_tenants_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tenants_code ON public.tenants USING btree (code);


--
-- Name: idx_tna_node_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tna_node_id ON public.task_node_allocations USING btree (node_id);


--
-- Name: idx_tna_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tna_task_id ON public.task_node_allocations USING btree (task_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_workflows_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_status ON public.workflows USING btree (status);


--
-- Name: users sync_password_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_password_trigger BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_password_columns();


--
-- Name: evaluation_tasks trg_fill_chip_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_chip_id BEFORE INSERT OR UPDATE ON public.evaluation_tasks FOR EACH ROW EXECUTE FUNCTION public.fill_chip_id_from_plan();


--
-- Name: chip_reports trg_sync_chip_report; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_chip_report AFTER INSERT OR UPDATE ON public.chip_reports FOR EACH ROW EXECUTE FUNCTION public.sync_chip_report_to_eval_report();


--
-- Name: alerts alerts_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.evaluation_tasks(id);


--
-- Name: alerts alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chips chips_default_baseline_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chips
    ADD CONSTRAINT chips_default_baseline_plan_id_fkey FOREIGN KEY (default_baseline_plan_id) REFERENCES public.evaluation_plans(id);


--
-- Name: datasets datasets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: evaluation_object_versions evaluation_object_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_object_versions
    ADD CONSTRAINT evaluation_object_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: evaluation_object_versions evaluation_object_versions_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_object_versions
    ADD CONSTRAINT evaluation_object_versions_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.evaluation_objects(id) ON DELETE CASCADE;


--
-- Name: evaluation_object_versions evaluation_object_versions_parent_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_object_versions
    ADD CONSTRAINT evaluation_object_versions_parent_version_id_fkey FOREIGN KEY (parent_version_id) REFERENCES public.evaluation_object_versions(id);


--
-- Name: evaluation_objects evaluation_objects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_objects
    ADD CONSTRAINT evaluation_objects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: evaluation_reports evaluation_reports_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_reports
    ADD CONSTRAINT evaluation_reports_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.evaluation_tasks(id);


--
-- Name: evaluation_tasks evaluation_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_tasks
    ADD CONSTRAINT evaluation_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: evaluation_tasks evaluation_tasks_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_tasks
    ADD CONSTRAINT evaluation_tasks_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.evaluation_objects(id);


--
-- Name: evaluation_tasks evaluation_tasks_object_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_tasks
    ADD CONSTRAINT evaluation_tasks_object_version_id_fkey FOREIGN KEY (object_version_id) REFERENCES public.evaluation_object_versions(id);


--
-- Name: evaluation_tasks evaluation_tasks_retry_from_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_tasks
    ADD CONSTRAINT evaluation_tasks_retry_from_task_id_fkey FOREIGN KEY (retry_from_task_id) REFERENCES public.evaluation_tasks(id);


--
-- Name: evaluation_tasks evaluation_tasks_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_tasks
    ADD CONSTRAINT evaluation_tasks_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.task_templates(id);


--
-- Name: evaluation_tasks fk_eval_tasks_parent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_tasks
    ADD CONSTRAINT fk_eval_tasks_parent FOREIGN KEY (parent_task_id) REFERENCES public.evaluation_tasks(id);


--
-- Name: task_templates fk_templates_fork_from; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT fk_templates_fork_from FOREIGN KEY (fork_from) REFERENCES public.task_templates(id);


--
-- Name: template_metrics fkfnwlawnem5mwq46ktbosfpiea; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_metrics
    ADD CONSTRAINT fkfnwlawnem5mwq46ktbosfpiea FOREIGN KEY (metric_id) REFERENCES public.evaluation_metrics(id);


--
-- Name: template_metrics fkixb1klsgs114ekx7xegvo7n2r; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_metrics
    ADD CONSTRAINT fkixb1klsgs114ekx7xegvo7n2r FOREIGN KEY (template_id) REFERENCES public.task_templates(id);


--
-- Name: resources resources_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.resource_pools(id);


--
-- Name: task_environments task_environments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_environments
    ADD CONSTRAINT task_environments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.evaluation_tasks(id) ON DELETE CASCADE;


--
-- Name: task_logs task_logs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_logs
    ADD CONSTRAINT task_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.evaluation_tasks(id) ON DELETE CASCADE;


--
-- Name: task_templates task_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT task_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: user_tenants user_tenants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_tenants user_tenants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


