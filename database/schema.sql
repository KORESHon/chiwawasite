--
-- PostgreSQL database dump
--

-- Dumped from database version 14.18 (Ubuntu 14.18-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.18 (Ubuntu 14.18-0ubuntu0.22.04.1)

-- Started on 2025-07-28 21:21:12 UTC

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

DROP DATABASE IF EXISTS chiwawa;
--
-- TOC entry 3667 (class 1262 OID 16816)
-- Name: chiwawa; Type: DATABASE; Schema: -; Owner: chiwawa
--

CREATE DATABASE chiwawa WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE = 'C.UTF-8';


ALTER DATABASE chiwawa OWNER TO chiwawa;

\connect chiwawa

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
-- TOC entry 4 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO postgres;

--
-- TOC entry 3668 (class 0 OID 0)
-- Dependencies: 4
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 268 (class 1255 OID 17173)
-- Name: calculate_user_reputation(integer); Type: FUNCTION; Schema: public; Owner: chiwawa
--

CREATE FUNCTION public.calculate_user_reputation(user_id_param integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    base_score INTEGER := 0;
    bonus_score INTEGER := 0;
    penalty_score INTEGER := 0;
    final_score INTEGER := 0;
    rep_record RECORD;
BEGIN
    -- Получаем данные репутации пользователя
    SELECT * INTO rep_record FROM user_reputation WHERE user_id = user_id_param;
    
    IF rep_record IS NULL THEN
        -- Создаем запись репутации если её нет
        INSERT INTO user_reputation (user_id) VALUES (user_id_param);
        RETURN 0;
    END IF;
    
    -- Базовая репутация от голосов
    base_score := (rep_record.positive_votes * 2) - rep_record.negative_votes;
    
    -- Бонусы за активность
    bonus_score := (rep_record.forum_posts / 10) + 
                   (rep_record.helpful_posts * 3) + 
                   (rep_record.reported_bugs * 5) + 
                   (rep_record.community_contributions * 10);
    
    -- Штрафы
    penalty_score := (rep_record.warnings_received * 5) + 
                     (rep_record.temporary_bans * 20) + 
                     rep_record.reputation_penalties;
    
    -- Итоговый счет (не может быть меньше 0)
    final_score := GREATEST(base_score + bonus_score - penalty_score, 0);
    
    -- Обновляем репутацию
    UPDATE user_reputation 
    SET reputation_score = final_score, updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = user_id_param;
    
    RETURN final_score;
END;
$$;


ALTER FUNCTION public.calculate_user_reputation(user_id_param integer) OWNER TO chiwawa;

--
-- TOC entry 269 (class 1255 OID 17174)
-- Name: can_apply_for_trust_level(integer, integer); Type: FUNCTION; Schema: public; Owner: chiwawa
--

CREATE FUNCTION public.can_apply_for_trust_level(user_id_param integer, target_level integer) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    user_record RECORD;
    stats_record RECORD;
    reputation_score INTEGER;
    hours_played DECIMAL(10,2);
    result JSON;
    requirements JSON;
    met_requirements JSON;
BEGIN
    -- Получаем данные пользователя
    SELECT * INTO user_record FROM users WHERE id = user_id_param;
    SELECT * INTO stats_record FROM player_stats WHERE user_id = user_id_param;
    
    IF user_record IS NULL THEN
        RETURN '{"error": "Пользователь не найден"}'::JSON;
    END IF;
    
    -- Рассчитываем репутацию
    reputation_score := calculate_user_reputation(user_id_param);
    hours_played := COALESCE(stats_record.total_minutes, 0) / 60.0;
    
    -- Определяем требования для каждого уровня
    CASE target_level
        WHEN 1 THEN -- Новичок
            requirements := '{"email_verified": true, "hours_played": 0, "reputation": 0}'::JSON;
        WHEN 2 THEN -- Проверенный
            requirements := '{"email_verified": true, "hours_played": 25, "reputation": 10}'::JSON;
        WHEN 3 THEN -- Ветеран
            requirements := '{"email_verified": true, "hours_played": 50, "reputation": 20}'::JSON;
        ELSE
            RETURN '{"error": "Неверный уровень"}'::JSON;
    END CASE;
    
    -- Проверяем выполнение требований
    met_requirements := json_build_object(
        'email_verified', user_record.is_email_verified,
        'hours_played', hours_played >= (requirements->>'hours_played')::INTEGER,
        'reputation', reputation_score >= (requirements->>'reputation')::INTEGER,
        'level_lower', user_record.trust_level < target_level
    );
    
    result := json_build_object(
        'can_apply', 
        (met_requirements->>'email_verified')::BOOLEAN AND 
        (met_requirements->>'hours_played')::BOOLEAN AND 
        (met_requirements->>'reputation')::BOOLEAN AND 
        (met_requirements->>'level_lower')::BOOLEAN,
        'requirements', requirements,
        'current_status', json_build_object(
            'email_verified', user_record.is_email_verified,
            'hours_played', hours_played,
            'reputation', reputation_score,
            'current_level', user_record.trust_level
        ),
        'met_requirements', met_requirements
    );
    
    RETURN result;
END;
$$;


ALTER FUNCTION public.can_apply_for_trust_level(user_id_param integer, target_level integer) OWNER TO chiwawa;

--
-- TOC entry 256 (class 1255 OID 17095)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: root
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO root;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 227 (class 1259 OID 16993)
-- Name: achievements; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.achievements (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    icon character varying(50),
    points integer DEFAULT 0,
    category character varying(50) DEFAULT 'general'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.achievements OWNER TO root;

--
-- TOC entry 226 (class 1259 OID 16992)
-- Name: achievements_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.achievements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.achievements_id_seq OWNER TO root;

--
-- TOC entry 3669 (class 0 OID 0)
-- Dependencies: 226
-- Name: achievements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.achievements_id_seq OWNED BY public.achievements.id;


--
-- TOC entry 225 (class 1259 OID 16973)
-- Name: admin_logs; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.admin_logs (
    id integer NOT NULL,
    admin_id integer,
    action character varying(128) NOT NULL,
    target_user_id integer,
    details text,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.admin_logs OWNER TO root;

--
-- TOC entry 224 (class 1259 OID 16972)
-- Name: admin_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.admin_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.admin_logs_id_seq OWNER TO root;

--
-- TOC entry 3670 (class 0 OID 0)
-- Dependencies: 224
-- Name: admin_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.admin_logs_id_seq OWNED BY public.admin_logs.id;


--
-- TOC entry 213 (class 1259 OID 16852)
-- Name: applications; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.applications (
    id integer NOT NULL,
    user_id integer,
    minecraft_nick character varying(16) NOT NULL,
    age character varying(20) NOT NULL,
    discord character varying(100) NOT NULL,
    email character varying(128) NOT NULL,
    experience character varying(50) NOT NULL,
    motivation text NOT NULL,
    plans text NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    submitted_at timestamp without time zone DEFAULT now(),
    reviewed_at timestamp without time zone,
    reviewed_by integer,
    review_comment text,
    ip_address character varying(45),
    user_agent text,
    CONSTRAINT check_application_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'banned'::character varying])::text[])))
);


ALTER TABLE public.applications OWNER TO root;

--
-- TOC entry 212 (class 1259 OID 16851)
-- Name: applications_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.applications_id_seq OWNER TO root;

--
-- TOC entry 3671 (class 0 OID 0)
-- Dependencies: 212
-- Name: applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.applications_id_seq OWNED BY public.applications.id;


--
-- TOC entry 221 (class 1259 OID 16945)
-- Name: discord_oauth; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.discord_oauth (
    id integer NOT NULL,
    user_id integer,
    access_token character varying(128),
    refresh_token character varying(128),
    expires_at timestamp without time zone,
    discord_username character varying(64),
    discord_discriminator character varying(4),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.discord_oauth OWNER TO root;

--
-- TOC entry 220 (class 1259 OID 16944)
-- Name: discord_oauth_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.discord_oauth_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.discord_oauth_id_seq OWNER TO root;

--
-- TOC entry 3672 (class 0 OID 0)
-- Dependencies: 220
-- Name: discord_oauth_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.discord_oauth_id_seq OWNED BY public.discord_oauth.id;


--
-- TOC entry 241 (class 1259 OID 17311)
-- Name: email_templates; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.email_templates (
    id integer NOT NULL,
    template_name character varying(100) NOT NULL,
    template_subject character varying(500) NOT NULL,
    template_html text NOT NULL,
    template_variables text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    updated_by integer,
    created_by integer
);


ALTER TABLE public.email_templates OWNER TO root;

--
-- TOC entry 240 (class 1259 OID 17310)
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.email_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.email_templates_id_seq OWNER TO root;

--
-- TOC entry 3673 (class 0 OID 0)
-- Dependencies: 240
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;


--
-- TOC entry 219 (class 1259 OID 16929)
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.email_verification_tokens (
    id integer NOT NULL,
    user_id integer,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    used boolean DEFAULT false
);


ALTER TABLE public.email_verification_tokens OWNER TO root;

--
-- TOC entry 218 (class 1259 OID 16928)
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.email_verification_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.email_verification_tokens_id_seq OWNER TO root;

--
-- TOC entry 3674 (class 0 OID 0)
-- Dependencies: 218
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.email_verification_tokens_id_seq OWNED BY public.email_verification_tokens.id;


--
-- TOC entry 216 (class 1259 OID 16898)
-- Name: login_logs; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.login_logs (
    id integer NOT NULL,
    user_id integer,
    login_time timestamp without time zone DEFAULT now(),
    ip_address character varying(45),
    user_agent text,
    success boolean DEFAULT true
);


ALTER TABLE public.login_logs OWNER TO root;

--
-- TOC entry 215 (class 1259 OID 16897)
-- Name: login_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.login_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.login_logs_id_seq OWNER TO root;

--
-- TOC entry 3675 (class 0 OID 0)
-- Dependencies: 215
-- Name: login_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.login_logs_id_seq OWNED BY public.login_logs.id;


--
-- TOC entry 243 (class 1259 OID 17357)
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: chiwawa
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    user_id integer,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    used boolean DEFAULT false
);


ALTER TABLE public.password_reset_tokens OWNER TO chiwawa;

--
-- TOC entry 242 (class 1259 OID 17356)
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: chiwawa
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.password_reset_tokens_id_seq OWNER TO chiwawa;

--
-- TOC entry 3676 (class 0 OID 0)
-- Dependencies: 242
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chiwawa
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- TOC entry 214 (class 1259 OID 16873)
-- Name: player_stats; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.player_stats (
    user_id integer NOT NULL,
    total_minutes integer DEFAULT 0,
    daily_limit_minutes integer DEFAULT 600,
    is_time_limited boolean DEFAULT true,
    current_level integer DEFAULT 0,
    time_played_minutes integer DEFAULT 0,
    email_verified boolean DEFAULT false,
    discord_verified boolean DEFAULT false,
    minecraft_verified boolean DEFAULT false,
    reputation integer DEFAULT 0,
    achievements_count integer DEFAULT 0,
    total_logins integer DEFAULT 0,
    warnings_count integer DEFAULT 0,
    last_update timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.player_stats OWNER TO root;

--
-- TOC entry 239 (class 1259 OID 17154)
-- Name: reputation_log; Type: TABLE; Schema: public; Owner: chiwawa
--

CREATE TABLE public.reputation_log (
    id integer NOT NULL,
    user_id integer NOT NULL,
    change_amount integer NOT NULL,
    reason character varying(100) NOT NULL,
    details text,
    admin_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.reputation_log OWNER TO chiwawa;

--
-- TOC entry 238 (class 1259 OID 17153)
-- Name: reputation_log_id_seq; Type: SEQUENCE; Schema: public; Owner: chiwawa
--

CREATE SEQUENCE public.reputation_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.reputation_log_id_seq OWNER TO chiwawa;

--
-- TOC entry 3677 (class 0 OID 0)
-- Dependencies: 238
-- Name: reputation_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chiwawa
--

ALTER SEQUENCE public.reputation_log_id_seq OWNED BY public.reputation_log.id;


--
-- TOC entry 233 (class 1259 OID 17039)
-- Name: server_rules; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.server_rules (
    id integer NOT NULL,
    title character varying(128) NOT NULL,
    content text NOT NULL,
    category character varying(64) DEFAULT 'general'::character varying,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.server_rules OWNER TO root;

--
-- TOC entry 232 (class 1259 OID 17038)
-- Name: server_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.server_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.server_rules_id_seq OWNER TO root;

--
-- TOC entry 3678 (class 0 OID 0)
-- Dependencies: 232
-- Name: server_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.server_rules_id_seq OWNED BY public.server_rules.id;


--
-- TOC entry 245 (class 1259 OID 17381)
-- Name: server_settings; Type: TABLE; Schema: public; Owner: chiwawa
--

CREATE TABLE public.server_settings (
    id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text,
    setting_type character varying(20) DEFAULT 'string'::character varying,
    category character varying(50) DEFAULT 'general'::character varying,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by integer
);


ALTER TABLE public.server_settings OWNER TO chiwawa;

--
-- TOC entry 244 (class 1259 OID 17380)
-- Name: server_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: chiwawa
--

CREATE SEQUENCE public.server_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.server_settings_id_seq OWNER TO chiwawa;

--
-- TOC entry 3679 (class 0 OID 0)
-- Dependencies: 244
-- Name: server_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chiwawa
--

ALTER SEQUENCE public.server_settings_id_seq OWNED BY public.server_settings.id;


--
-- TOC entry 231 (class 1259 OID 17026)
-- Name: server_status; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.server_status (
    id integer NOT NULL,
    is_online boolean DEFAULT false,
    online_players integer DEFAULT 0,
    max_players integer DEFAULT 20,
    server_version character varying(32),
    motd text,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.server_status OWNER TO root;

--
-- TOC entry 230 (class 1259 OID 17025)
-- Name: server_status_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.server_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.server_status_id_seq OWNER TO root;

--
-- TOC entry 3680 (class 0 OID 0)
-- Dependencies: 230
-- Name: server_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.server_status_id_seq OWNED BY public.server_status.id;


--
-- TOC entry 235 (class 1259 OID 17102)
-- Name: trust_level_applications; Type: TABLE; Schema: public; Owner: chiwawa
--

CREATE TABLE public.trust_level_applications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    current_level integer NOT NULL,
    requested_level integer NOT NULL,
    reason text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    hours_played numeric(10,2) DEFAULT 0 NOT NULL,
    reputation_score integer DEFAULT 0 NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    review_comment text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT trust_level_applications_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.trust_level_applications OWNER TO chiwawa;

--
-- TOC entry 234 (class 1259 OID 17101)
-- Name: trust_level_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: chiwawa
--

CREATE SEQUENCE public.trust_level_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.trust_level_applications_id_seq OWNER TO chiwawa;

--
-- TOC entry 3681 (class 0 OID 0)
-- Dependencies: 234
-- Name: trust_level_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chiwawa
--

ALTER SEQUENCE public.trust_level_applications_id_seq OWNED BY public.trust_level_applications.id;


--
-- TOC entry 229 (class 1259 OID 17006)
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.user_achievements (
    id integer NOT NULL,
    user_id integer,
    achievement_id integer,
    earned_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.user_achievements OWNER TO root;

--
-- TOC entry 228 (class 1259 OID 17005)
-- Name: user_achievements_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.user_achievements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_achievements_id_seq OWNER TO root;

--
-- TOC entry 3682 (class 0 OID 0)
-- Dependencies: 228
-- Name: user_achievements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.user_achievements_id_seq OWNED BY public.user_achievements.id;


--
-- TOC entry 223 (class 1259 OID 16958)
-- Name: user_activity; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.user_activity (
    id integer NOT NULL,
    user_id integer,
    activity_type character varying(50) NOT NULL,
    description text NOT NULL,
    metadata jsonb,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.user_activity OWNER TO root;

--
-- TOC entry 222 (class 1259 OID 16957)
-- Name: user_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.user_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_activity_id_seq OWNER TO root;

--
-- TOC entry 3683 (class 0 OID 0)
-- Dependencies: 222
-- Name: user_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.user_activity_id_seq OWNED BY public.user_activity.id;


--
-- TOC entry 237 (class 1259 OID 17128)
-- Name: user_reputation; Type: TABLE; Schema: public; Owner: chiwawa
--

CREATE TABLE public.user_reputation (
    id integer NOT NULL,
    user_id integer NOT NULL,
    reputation_score integer DEFAULT 0,
    positive_votes integer DEFAULT 0,
    negative_votes integer DEFAULT 0,
    forum_posts integer DEFAULT 0,
    helpful_posts integer DEFAULT 0,
    reported_bugs integer DEFAULT 0,
    community_contributions integer DEFAULT 0,
    warnings_received integer DEFAULT 0,
    temporary_bans integer DEFAULT 0,
    reputation_penalties integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_reputation OWNER TO chiwawa;

--
-- TOC entry 236 (class 1259 OID 17127)
-- Name: user_reputation_id_seq; Type: SEQUENCE; Schema: public; Owner: chiwawa
--

CREATE SEQUENCE public.user_reputation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_reputation_id_seq OWNER TO chiwawa;

--
-- TOC entry 3684 (class 0 OID 0)
-- Dependencies: 236
-- Name: user_reputation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chiwawa
--

ALTER SEQUENCE public.user_reputation_id_seq OWNED BY public.user_reputation.id;


--
-- TOC entry 217 (class 1259 OID 16913)
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id integer,
    token_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    ip_address character varying(45),
    user_agent text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.user_sessions OWNER TO root;

--
-- TOC entry 211 (class 1259 OID 16829)
-- Name: users; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.users (
    id integer NOT NULL,
    nickname character varying(32) NOT NULL,
    email character varying(128) NOT NULL,
    password_hash character varying(128) NOT NULL,
    first_name character varying(50),
    last_name character varying(50),
    age character varying(20),
    display_name character varying(50),
    bio text,
    avatar_url character varying(255),
    discord_id character varying(32),
    discord_tag character varying(64),
    role character varying(32) DEFAULT 'user'::character varying,
    trust_level integer DEFAULT 0,
    status character varying(32) DEFAULT 'active'::character varying,
    is_active boolean DEFAULT true,
    is_email_verified boolean DEFAULT false,
    is_banned boolean DEFAULT false,
    registered_at timestamp without time zone DEFAULT now(),
    last_login timestamp without time zone,
    ban_reason text,
    CONSTRAINT check_role CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'admin'::character varying, 'moderator'::character varying])::text[]))),
    CONSTRAINT check_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'banned'::character varying, 'pending'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT check_trust_level CHECK (((trust_level >= 0) AND (trust_level <= 5)))
);


ALTER TABLE public.users OWNER TO root;

--
-- TOC entry 3685 (class 0 OID 0)
-- Dependencies: 211
-- Name: COLUMN users.trust_level; Type: COMMENT; Schema: public; Owner: root
--

COMMENT ON COLUMN public.users.trust_level IS 'Trust Level: 0=Проходимец(10ч лимит), 1=Новичок(стандарт), 2=Проверенный(25ч+почта+10реп), 3=Ветеран(50ч+почта+20реп)';


--
-- TOC entry 210 (class 1259 OID 16828)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: root
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO root;

--
-- TOC entry 3686 (class 0 OID 0)
-- Dependencies: 210
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 3317 (class 2604 OID 16996)
-- Name: achievements id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.achievements ALTER COLUMN id SET DEFAULT nextval('public.achievements_id_seq'::regclass);


--
-- TOC entry 3315 (class 2604 OID 16976)
-- Name: admin_logs id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.admin_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_logs_id_seq'::regclass);


--
-- TOC entry 3284 (class 2604 OID 16855)
-- Name: applications id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.applications ALTER COLUMN id SET DEFAULT nextval('public.applications_id_seq'::regclass);


--
-- TOC entry 3311 (class 2604 OID 16948)
-- Name: discord_oauth id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.discord_oauth ALTER COLUMN id SET DEFAULT nextval('public.discord_oauth_id_seq'::regclass);


--
-- TOC entry 3358 (class 2604 OID 17314)
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);


--
-- TOC entry 3308 (class 2604 OID 16932)
-- Name: email_verification_tokens id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_verification_tokens ALTER COLUMN id SET DEFAULT nextval('public.email_verification_tokens_id_seq'::regclass);


--
-- TOC entry 3302 (class 2604 OID 16901)
-- Name: login_logs id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.login_logs ALTER COLUMN id SET DEFAULT nextval('public.login_logs_id_seq'::regclass);


--
-- TOC entry 3362 (class 2604 OID 17360)
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- TOC entry 3356 (class 2604 OID 17157)
-- Name: reputation_log id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.reputation_log ALTER COLUMN id SET DEFAULT nextval('public.reputation_log_id_seq'::regclass);


--
-- TOC entry 3329 (class 2604 OID 17042)
-- Name: server_rules id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.server_rules ALTER COLUMN id SET DEFAULT nextval('public.server_rules_id_seq'::regclass);


--
-- TOC entry 3365 (class 2604 OID 17384)
-- Name: server_settings id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.server_settings ALTER COLUMN id SET DEFAULT nextval('public.server_settings_id_seq'::regclass);


--
-- TOC entry 3325 (class 2604 OID 17029)
-- Name: server_status id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.server_status ALTER COLUMN id SET DEFAULT nextval('public.server_status_id_seq'::regclass);


--
-- TOC entry 3335 (class 2604 OID 17105)
-- Name: trust_level_applications id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.trust_level_applications ALTER COLUMN id SET DEFAULT nextval('public.trust_level_applications_id_seq'::regclass);


--
-- TOC entry 3322 (class 2604 OID 17009)
-- Name: user_achievements id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements ALTER COLUMN id SET DEFAULT nextval('public.user_achievements_id_seq'::regclass);


--
-- TOC entry 3313 (class 2604 OID 16961)
-- Name: user_activity id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_activity ALTER COLUMN id SET DEFAULT nextval('public.user_activity_id_seq'::regclass);


--
-- TOC entry 3343 (class 2604 OID 17131)
-- Name: user_reputation id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.user_reputation ALTER COLUMN id SET DEFAULT nextval('public.user_reputation_id_seq'::regclass);


--
-- TOC entry 3273 (class 2604 OID 16832)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 3643 (class 0 OID 16993)
-- Dependencies: 227
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.achievements VALUES (1, 'Первый вход', 'Впервые зашли на сервер', 'star', 10, 'milestone', true, '2025-07-26 05:12:51.073902');
INSERT INTO public.achievements VALUES (2, 'Новичок', 'Играли 1 час', 'clock', 20, 'playtime', true, '2025-07-26 05:12:51.073902');
INSERT INTO public.achievements VALUES (3, 'Активный игрок', 'Играли 10 часов', 'trophy', 50, 'playtime', true, '2025-07-26 05:12:51.073902');
INSERT INTO public.achievements VALUES (4, 'Ветеран', 'Играли 100 часов', 'crown', 100, 'playtime', true, '2025-07-26 05:12:51.073902');
INSERT INTO public.achievements VALUES (5, 'Подтвержденный', 'Подтвердили email адрес', 'check-circle', 30, 'verification', true, '2025-07-26 05:12:51.073902');
INSERT INTO public.achievements VALUES (6, 'Социальный', 'Привязали Discord аккаунт', 'discord', 25, 'social', true, '2025-07-26 05:12:51.073902');
INSERT INTO public.achievements VALUES (7, 'Строитель', 'Построили свой первый дом', 'home', 40, 'building', true, '2025-07-26 05:12:51.073902');
INSERT INTO public.achievements VALUES (8, 'Исследователь', 'Прошли 10,000 блоков', 'map', 60, 'exploration', true, '2025-07-26 05:12:51.073902');


--
-- TOC entry 3641 (class 0 OID 16973)
-- Dependencies: 225
-- Data for Name: admin_logs; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.admin_logs VALUES (1, 1, 'settings_updated', NULL, 'Настройки сервера обновлены: server_name', NULL, '2025-07-26 14:36:29.249472');
INSERT INTO public.admin_logs VALUES (2, 1, 'settings_updated', NULL, 'Настройки сервера обновлены: server_name', NULL, '2025-07-26 14:38:46.644086');
INSERT INTO public.admin_logs VALUES (3, 1, 'settings_updated', NULL, 'Настройки сервера обновлены: ', NULL, '2025-07-26 19:29:40.045455');
INSERT INTO public.admin_logs VALUES (4, 1, 'trust_level_changed', 1, 'Уровень доверия ebluffy изменен с 5 на 3: Админ', NULL, '2025-07-26 20:23:29.440632');
INSERT INTO public.admin_logs VALUES (5, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-26 21:07:21.32828');
INSERT INTO public.admin_logs VALUES (6, 1, 'settings_updated', NULL, 'Настройки сервера обновлены: ', NULL, '2025-07-26 21:07:21.426516');
INSERT INTO public.admin_logs VALUES (7, 1, 'trust_level_changed', 1, 'Уровень доверия ebluffy изменен с 3 на 3: да', NULL, '2025-07-26 22:35:10.892645');
INSERT INTO public.admin_logs VALUES (8, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-26 23:21:14.171374');
INSERT INTO public.admin_logs VALUES (9, 1, 'settings_updated', NULL, 'Настройки сервера обновлены: ', NULL, '2025-07-26 23:21:14.709568');
INSERT INTO public.admin_logs VALUES (23, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 00:55:42.82768');
INSERT INTO public.admin_logs VALUES (24, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 00:55:42.926556');
INSERT INTO public.admin_logs VALUES (25, 1, 'settings_updated', NULL, 'Обновлено настроек: 37. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 00:55:47.247204');
INSERT INTO public.admin_logs VALUES (26, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 00:56:39.983678');
INSERT INTO public.admin_logs VALUES (27, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 00:56:40.086809');
INSERT INTO public.admin_logs VALUES (28, 1, 'settings_updated', NULL, 'Обновлено настроек: 37. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 00:56:44.132133');
INSERT INTO public.admin_logs VALUES (29, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 00:57:17.2234');
INSERT INTO public.admin_logs VALUES (30, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 00:57:17.322086');
INSERT INTO public.admin_logs VALUES (31, 1, 'settings_updated', NULL, 'Обновлено настроек: 37. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 00:57:21.186094');
INSERT INTO public.admin_logs VALUES (32, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 00:57:49.324029');
INSERT INTO public.admin_logs VALUES (33, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 00:57:49.426556');
INSERT INTO public.admin_logs VALUES (34, 1, 'settings_updated', NULL, 'Обновлено настроек: 37. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 00:57:53.44678');
INSERT INTO public.admin_logs VALUES (35, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 00:58:28.66028');
INSERT INTO public.admin_logs VALUES (36, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 00:58:28.758463');
INSERT INTO public.admin_logs VALUES (37, 1, 'settings_updated', NULL, 'Обновлено настроек: 37. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 00:58:32.618463');
INSERT INTO public.admin_logs VALUES (38, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 00:58:52.206731');
INSERT INTO public.admin_logs VALUES (39, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 00:59:30.087305');
INSERT INTO public.admin_logs VALUES (40, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 01:02:52.020948');
INSERT INTO public.admin_logs VALUES (41, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 01:02:52.135585');
INSERT INTO public.admin_logs VALUES (42, 1, 'settings_updated', NULL, 'Обновлено настроек: 37. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 01:02:56.548146');
INSERT INTO public.admin_logs VALUES (43, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 01:29:38.711702');
INSERT INTO public.admin_logs VALUES (44, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 01:39:46.186559');
INSERT INTO public.admin_logs VALUES (45, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 01:39:46.292273');
INSERT INTO public.admin_logs VALUES (46, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 01:39:50.060528');
INSERT INTO public.admin_logs VALUES (47, 1, 'email_test', NULL, 'Тестовое письмо отправлено на dima2_05@mail.ru, время доставки: 2197мс', NULL, '2025-07-27 01:39:51.930769');
INSERT INTO public.admin_logs VALUES (48, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 01:41:17.740805');
INSERT INTO public.admin_logs VALUES (49, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 01:41:17.846079');
INSERT INTO public.admin_logs VALUES (50, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 01:41:22.132067');
INSERT INTO public.admin_logs VALUES (51, 1, 'email_test', NULL, 'Тестовое письмо отправлено на dima2_05@mail.ru, время доставки: 1446мс', NULL, '2025-07-27 01:41:26.734992');
INSERT INTO public.admin_logs VALUES (52, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 02:08:36.77151');
INSERT INTO public.admin_logs VALUES (53, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 02:08:36.868796');
INSERT INTO public.admin_logs VALUES (54, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 02:08:41.140532');
INSERT INTO public.admin_logs VALUES (55, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 02:45:41.166869');
INSERT INTO public.admin_logs VALUES (56, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 02:45:59.070976');
INSERT INTO public.admin_logs VALUES (57, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 02:45:59.176129');
INSERT INTO public.admin_logs VALUES (58, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 02:46:03.336177');
INSERT INTO public.admin_logs VALUES (59, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 02:46:08.736673');
INSERT INTO public.admin_logs VALUES (60, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 02:46:20.772884');
INSERT INTO public.admin_logs VALUES (61, 1, 'email_test', NULL, 'Тестовое письмо отправлено на dima2_05@mail.ru, время доставки: 1507мс', NULL, '2025-07-27 02:47:17.171881');
INSERT INTO public.admin_logs VALUES (62, 1, 'email_test', NULL, 'Тестовое письмо отправлено на dima2_05@mail.ru, время доставки: 1501мс', NULL, '2025-07-27 02:47:49.146121');
INSERT INTO public.admin_logs VALUES (63, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 02:47:59.597577');
INSERT INTO public.admin_logs VALUES (64, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-27 02:48:14.6511');
INSERT INTO public.admin_logs VALUES (65, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-27 02:48:14.750431');
INSERT INTO public.admin_logs VALUES (66, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-27 02:48:18.994036');
INSERT INTO public.admin_logs VALUES (67, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 02:48:29.839331');
INSERT INTO public.admin_logs VALUES (68, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 02:48:47.767386');
INSERT INTO public.admin_logs VALUES (69, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 02:48:56.09892');
INSERT INTO public.admin_logs VALUES (70, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 02:59:17.645271');
INSERT INTO public.admin_logs VALUES (71, 1, 'email_test', NULL, 'Тестовое письмо отправлено на dima2_05@mail.ru, время доставки: 1659мс', NULL, '2025-07-27 02:59:40.831092');
INSERT INTO public.admin_logs VALUES (72, 1, 'email_test', NULL, 'Тестовое письмо отправлено на dima2_05@mail.ru, время доставки: 1371мс', NULL, '2025-07-27 03:00:09.61514');
INSERT INTO public.admin_logs VALUES (73, 1, 'email_template_saved', NULL, 'Сохранен email шаблон: welcome (Приветственное письмо)', NULL, '2025-07-27 03:00:17.712523');
INSERT INTO public.admin_logs VALUES (74, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 03:00:20.142001');
INSERT INTO public.admin_logs VALUES (75, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 03:12:55.593583');
INSERT INTO public.admin_logs VALUES (76, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 03:14:25.82282');
INSERT INTO public.admin_logs VALUES (77, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 03:19:06.254194');
INSERT INTO public.admin_logs VALUES (78, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 03:24:29.880438');
INSERT INTO public.admin_logs VALUES (79, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 03:24:40.29227');
INSERT INTO public.admin_logs VALUES (80, 1, 'email_template_tested', NULL, 'Тестирование email шаблона на адрес: dima2_05@mail.ru', NULL, '2025-07-27 03:24:49.978911');
INSERT INTO public.admin_logs VALUES (81, 1, 'email_template_saved', NULL, 'Сохранен email шаблон: welcome (Приветственное письмо)', NULL, '2025-07-27 03:25:58.476715');
INSERT INTO public.admin_logs VALUES (82, 1, 'email_template_saved', NULL, 'Сохранен email шаблон: welcome (Приветственное письмо)', NULL, '2025-07-27 03:26:36.262519');
INSERT INTO public.admin_logs VALUES (83, 1, 'email_test', NULL, 'Тестовое письмо отправлено на dima2_05@mail.ru, время доставки: 1561мс', NULL, '2025-07-27 03:36:21.915268');
INSERT INTO public.admin_logs VALUES (84, 1, 'email_test', NULL, 'Тестовое письмо отправлено на dima2_05@mail.ru, время доставки: 1448мс', NULL, '2025-07-27 03:37:04.757238');
INSERT INTO public.admin_logs VALUES (85, 1, 'email_template_tested', NULL, 'Тестирование шаблона "welcome" на адрес: dima2_05@mail.ru', NULL, '2025-07-28 01:35:16.524914');
INSERT INTO public.admin_logs VALUES (86, 1, 'email_template_tested', NULL, 'Тестирование шаблона "welcome" на адрес: dau31420@gmail.com', NULL, '2025-07-28 01:37:36.23634');
INSERT INTO public.admin_logs VALUES (87, 1, 'email_template_tested', NULL, 'Тестирование шаблона "welcome" на адрес: dima2_05@mail.ru', NULL, '2025-07-28 01:46:07.539489');
INSERT INTO public.admin_logs VALUES (88, 1, 'email_template_tested', NULL, 'Тестирование шаблона "verification" на адрес: dima2_05@mail.ru', NULL, '2025-07-28 01:46:23.120349');
INSERT INTO public.admin_logs VALUES (89, 1, 'email_template_tested', NULL, 'Тестирование шаблона "application-approved" на адрес: dima2_05@mail.ru', NULL, '2025-07-28 01:47:09.926867');
INSERT INTO public.admin_logs VALUES (90, 1, 'email_template_tested', NULL, 'Тестирование шаблона "application-rejected" на адрес: dima2_05@mail.ru', NULL, '2025-07-28 01:47:40.141686');
INSERT INTO public.admin_logs VALUES (91, 1, 'email_template_tested', NULL, 'Тестирование шаблона "password-reset" на адрес: dima2_05@mail.ru', NULL, '2025-07-28 01:47:52.605333');
INSERT INTO public.admin_logs VALUES (92, 1, 'email_template_tested', NULL, 'Тестирование шаблона "newsletter" на адрес: dima2_05@mail.ru', NULL, '2025-07-28 01:48:11.661427');
INSERT INTO public.admin_logs VALUES (93, 1, 'email_template_tested', NULL, 'Тестирование шаблона "welcome" на адрес: dima2_05@mail.ru', NULL, '2025-07-28 01:56:37.451794');
INSERT INTO public.admin_logs VALUES (94, 1, 'database_migration', NULL, 'Выполнена миграция 003: оптимизация структуры БД', NULL, '2025-07-28 02:13:19.315542');
INSERT INTO public.admin_logs VALUES (95, 1, 'database_migration', NULL, 'Выполнена миграция 003: оптимизация структуры БД', NULL, '2025-07-28 02:14:30.579609');
INSERT INTO public.admin_logs VALUES (96, 1, 'email_template_tested', NULL, 'Тестирование шаблона "welcome" для пользователя ebluffy (dima2_05@mail.ru)', NULL, '2025-07-28 02:15:47.766164');
INSERT INTO public.admin_logs VALUES (97, 1, 'email_template_saved', NULL, 'Сохранен email шаблон: welcome (Приветственное письмо)', NULL, '2025-07-28 02:25:33.418699');
INSERT INTO public.admin_logs VALUES (98, 1, 'settings_updated', NULL, 'Настройки сервера обновлены через админ-панель', NULL, '2025-07-28 02:50:37.52471');
INSERT INTO public.admin_logs VALUES (99, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 02:50:37.63233');
INSERT INTO public.admin_logs VALUES (100, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 02:50:41.970318');
INSERT INTO public.admin_logs VALUES (101, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 03:34:47.221676');
INSERT INTO public.admin_logs VALUES (102, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 03:34:49.053003');
INSERT INTO public.admin_logs VALUES (103, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 03:34:51.122161');
INSERT INTO public.admin_logs VALUES (104, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 03:34:52.871132');
INSERT INTO public.admin_logs VALUES (105, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 03:40:13.312135');
INSERT INTO public.admin_logs VALUES (106, 1, 'settings_updated', NULL, 'Обновлено настроек: 28. Категории: general, applications, trust, security, email', NULL, '2025-07-28 03:40:16.231664');
INSERT INTO public.admin_logs VALUES (107, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 03:40:17.205223');
INSERT INTO public.admin_logs VALUES (108, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 04:02:02.454981');
INSERT INTO public.admin_logs VALUES (109, 1, 'settings_updated', NULL, 'Обновлено настроек: 28. Категории: general, applications, trust, security, email', NULL, '2025-07-28 04:02:05.376076');
INSERT INTO public.admin_logs VALUES (110, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 04:02:06.278566');
INSERT INTO public.admin_logs VALUES (111, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 15:51:41.318811');
INSERT INTO public.admin_logs VALUES (112, 1, 'settings_updated', NULL, 'Обновлено настроек: 28. Категории: general, applications, trust, security, email', NULL, '2025-07-28 15:51:44.247759');
INSERT INTO public.admin_logs VALUES (113, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 15:51:45.288004');
INSERT INTO public.admin_logs VALUES (114, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 15:52:07.261275');
INSERT INTO public.admin_logs VALUES (115, 1, 'settings_updated', NULL, 'Обновлено настроек: 28. Категории: general, applications, trust, security, email', NULL, '2025-07-28 15:52:10.247147');
INSERT INTO public.admin_logs VALUES (116, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 15:52:11.059783');
INSERT INTO public.admin_logs VALUES (117, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 15:52:52.187563');
INSERT INTO public.admin_logs VALUES (118, 1, 'settings_updated', NULL, 'Обновлено настроек: 28. Категории: general, applications, trust, security, email', NULL, '2025-07-28 15:52:55.212174');
INSERT INTO public.admin_logs VALUES (119, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 15:52:56.0385');
INSERT INTO public.admin_logs VALUES (120, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 16:01:53.705571');
INSERT INTO public.admin_logs VALUES (121, 1, 'settings_updated', NULL, 'Обновлено настроек: 28. Категории: general, applications, trust, security, email', NULL, '2025-07-28 16:01:56.691762');
INSERT INTO public.admin_logs VALUES (122, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 16:01:58.045966');
INSERT INTO public.admin_logs VALUES (123, 1, 'settings_updated', NULL, 'Обновлено настроек: 0. Категории: ', NULL, '2025-07-28 16:06:52.476497');
INSERT INTO public.admin_logs VALUES (124, 1, 'settings_updated', NULL, 'Обновлено настроек: 28. Категории: general, applications, trust, security, email', NULL, '2025-07-28 16:06:55.420922');
INSERT INTO public.admin_logs VALUES (125, 1, 'settings_updated', NULL, 'Обновлено настроек: 36. Категории: general, system, applications, trust, security, email', NULL, '2025-07-28 16:06:56.30249');
INSERT INTO public.admin_logs VALUES (126, 1, 'profile_update', NULL, 'Обновлен профиль: имя', '::1', '2025-07-28 17:10:26.739994');
INSERT INTO public.admin_logs VALUES (127, 1, 'profile_update', NULL, 'Обновлен профиль: имя', '::1', '2025-07-28 17:10:34.277155');
INSERT INTO public.admin_logs VALUES (10, 1, 'trust_level_changed', NULL, 'Уровень доверия KORESHon изменен с 0 на 1: 1', NULL, '2025-07-26 23:21:57.766367');
INSERT INTO public.admin_logs VALUES (11, 1, 'role_changed', NULL, 'Роль пользователя KORESHon изменена с user на moderator', NULL, '2025-07-26 23:22:10.326156');
INSERT INTO public.admin_logs VALUES (12, 1, 'role_changed', NULL, 'Роль пользователя KORESHon изменена с moderator на user', NULL, '2025-07-26 23:30:44.054452');
INSERT INTO public.admin_logs VALUES (13, 1, 'role_changed', NULL, 'Роль пользователя KORESHon изменена с user на moderator', NULL, '2025-07-26 23:30:46.910976');
INSERT INTO public.admin_logs VALUES (14, 1, 'role_changed', NULL, 'Роль пользователя KORESHon изменена с moderator на user', NULL, '2025-07-26 23:46:14.624788');
INSERT INTO public.admin_logs VALUES (15, 1, 'role_changed', NULL, 'Роль пользователя KORESHon изменена с user на moderator', NULL, '2025-07-26 23:46:18.411085');
INSERT INTO public.admin_logs VALUES (16, 1, 'trust_level_changed', NULL, 'Уровень доверия KORESHon изменен с 1 на 2: я такзахотел', NULL, '2025-07-26 23:46:29.251048');
INSERT INTO public.admin_logs VALUES (17, 1, 'role_changed', NULL, 'Роль пользователя KORESHon изменена с moderator на user', NULL, '2025-07-26 23:52:01.704844');
INSERT INTO public.admin_logs VALUES (18, 1, 'trust_level_changed', NULL, 'Уровень доверия KORESHon изменен с 2 на 1: да', NULL, '2025-07-26 23:52:07.049433');
INSERT INTO public.admin_logs VALUES (19, 1, 'user_banned', NULL, 'Пользователь KORESHon заблокирован на 1 days: влопадвоапдоваповапрапр', NULL, '2025-07-26 23:52:16.908842');
INSERT INTO public.admin_logs VALUES (20, 1, 'user_unbanned', NULL, 'Пользователь KORESHon разблокирован', NULL, '2025-07-26 23:56:03.910547');
INSERT INTO public.admin_logs VALUES (21, 1, 'user_banned', NULL, 'Пользователь KORESHon заблокирован на 1 days: 1', NULL, '2025-07-26 23:56:54.320628');
INSERT INTO public.admin_logs VALUES (22, 1, 'user_unbanned', NULL, 'Пользователь KORESHon разблокирован', NULL, '2025-07-26 23:56:59.326968');
INSERT INTO public.admin_logs VALUES (128, 1, 'trust_level_changed', NULL, 'Уровень доверия KORESHon изменен с 1 на 0: да', NULL, '2025-07-28 20:30:16.455146');


--
-- TOC entry 3629 (class 0 OID 16852)
-- Dependencies: 213
-- Data for Name: applications; Type: TABLE DATA; Schema: public; Owner: root
--



--
-- TOC entry 3637 (class 0 OID 16945)
-- Dependencies: 221
-- Data for Name: discord_oauth; Type: TABLE DATA; Schema: public; Owner: root
--



--
-- TOC entry 3657 (class 0 OID 17311)
-- Dependencies: 241
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.email_templates VALUES (11, 'Сброс пароля', '🔑 Восстановление пароля - {{serverName}}', '<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold;">{{serverName}}</h1>
    </div>
    <h2 style="color: #f59e0b; text-align: center; margin-bottom: 25px; font-size: 24px;">🔑 Восстановление пароля</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!<br>
        Вы получили это письмо, потому что запросили восстановление пароля для аккаунта на сайте {{serverName}}.<br>
        Для создания нового пароля нажмите на кнопку ниже:
    </p>
    <div style="text-align: center; margin: 35px 0;">
        <a href="{{resetLink}}" style="display: inline-block; padding: 18px 36px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 17px;">🔐 Создать новый пароль</a>
    </div>
    <p style="font-size: 14px; color: #cbd5e1; text-align: center; margin-bottom: 18px;">
        Если кнопка не работает, скопируйте и вставьте эту ссылку в адресную строку браузера:<br>
        <span style="color: #f8b500; word-break: break-all;">{{resetLink}}</span>
    </p>
    <div style="background: rgba(245,158,11,0.10); border-radius: 8px; padding: 16px; margin-bottom: 22px;">
        <p style="font-size: 14px; color: #cbd5e1; margin: 0 0 6px 0;">
            Если вы не запрашивали восстановление пароля — просто проигнорируйте это письмо. Ваш пароль останется прежним.
        </p>
        <ul style="font-size: 15px; color: #cbd5e1; padding-left: 18px; margin-bottom: 4px;">
            <li>💬 <a href="{{discordInvite}}" style="color: #f59e0b; text-decoration: underline;">Служба поддержки в Discord</a></li>
            <li>📱 <a href="{{telegramInvite}}" style="color: #f59e0b; text-decoration: underline;">Чат поддержки Telegram</a></li>
        </ul>
    </div>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0;">С уважением, команда {{serverName}}</p>
        <p style="margin: 13px 0 0 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', NULL, true, '2025-07-27 02:32:33.272735', '2025-07-28 02:32:42.117305', 1, NULL);
INSERT INTO public.email_templates VALUES (12, 'Новостная рассылка', '📰 Новости {{serverName}}', '<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <h2 style="color: #8b5cf6; text-align: center; margin-bottom: 25px; font-size: 24px;">📰 Новости</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
</div>', NULL, true, '2025-07-27 02:32:33.378166', '2025-07-27 02:32:33.378166', 1, NULL);
INSERT INTO public.email_templates VALUES (8, 'Подтверждение email', 'Подтверждение email адреса - {{serverName}}', '<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold;">{{serverName}}</h1>
    </div>
    <h2 style="color: #10b981; text-align: center; margin-bottom: 25px; font-size: 24px;">🔐 Подтвердите ваш email</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!<br>
        Спасибо за регистрацию на нашем сервере.<br>
        Чтобы завершить регистрацию и получить полный доступ, подтвердите ваш email.
    </p>
    <div style="text-align: center; margin: 35px 0;">
        <a href="{{verificationLink}}" style="display: inline-block; padding: 18px 36px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 17px;">✅ Подтвердить email</a>
    </div>
    <p style="font-size: 14px; color: #cbd5e1; text-align: center; margin-bottom: 18px;">
        Если кнопка не работает, скопируйте и вставьте эту ссылку в браузер:<br>
        <span style="color: #10b981; word-break: break-all;">{{verificationLink}}</span>
    </p>
    <div style="background: rgba(16,185,129,0.12); border-radius: 8px; padding: 18px; margin: 28px 0;">
        <p style="margin: 0 0 10px 0; color: #f8b500; font-size: 15px;"><b>Полезные ссылки:</b></p>
        <ul style="font-size: 15px; color: #cbd5e1; padding-left: 18px; margin-bottom: 6px;">
            <li>🌐 IP сервера: <b style="color:#10b981;">{{serverIp}}</b></li>
            <li>💬 <a href="{{discordInvite}}" style="color: #10b981; text-decoration: underline;">Наш Discord</a></li>
            <li>📱 <a href="{{telegramInvite}}" style="color: #10b981; text-decoration: underline;">Наш Telegram</a></li>
        </ul>
    </div>
    <p style="text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 0;">
        Если вы не регистрировались, просто проигнорируйте это письмо.<br>
        — Команда {{serverName}}
    </p>
    <p style="text-align: center; margin: 15px 0 0 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
</div>', NULL, true, '2025-07-27 02:32:32.953907', '2025-07-28 02:27:30.501562', 1, NULL);
INSERT INTO public.email_templates VALUES (9, 'Заявка одобрена', '🎉 Ваша заявка одобрена - {{serverName}}', '<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #16a34a 0%, #10b981 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #fff; font-weight: bold;">{{serverName}}</h1>
    </div>
    <h2 style="color: #16a34a; text-align: center; margin-bottom: 25px; font-size: 24px;">🎉 Заявка одобрена!</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 18px;">
        Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!<br>
        Мы с радостью сообщаем, что ваша заявка была одобрена.<br>
        <span style="color: #10b981;">Теперь у вас есть доступ к новым возможностям сервера!</span>
    </p>
    <div style="background: rgba(16,185,129,0.12); border-radius: 8px; padding: 20px; margin-bottom: 22px;">
        <ul style="font-size: 15px; color: #cbd5e1; padding-left: 18px; margin-bottom: 8px;">
            <li>🌐 IP сервера: <b style="color:#16a34a;">{{serverIp}}</b></li>
            <li>💬 <a href="{{discordInvite}}" style="color: #16a34a; text-decoration: underline;">Присоединяйтесь к нашему Discord</a></li>
            <li>📱 <a href="{{telegramInvite}}" style="color: #16a34a; text-decoration: underline;">Наш Telegram-чат</a></li>
        </ul>
        <p style="font-size: 14px; color: #cbd5e1; margin: 10px 0 0 0;">
            Если у вас возникнут вопросы — не стесняйтесь обращаться к нашей команде или в сообщество.
        </p>
    </div>
    <p style="font-size: 15px; color: #f8b500; text-align: center; margin-bottom: 16px;">
        Удачной игры и новых достижений на {{serverName}}!
    </p>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0;">С уважением, команда {{serverName}}</p>
        <p style="margin: 13px 0 0 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', NULL, true, '2025-07-27 02:32:33.060762', '2025-07-28 02:29:11.03185', 1, NULL);
INSERT INTO public.email_templates VALUES (10, 'Заявка отклонена', '❌ О вашей заявке - {{serverName}}', '<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #fff; font-weight: bold;">{{serverName}}</h1>
    </div>
    <h2 style="color: #dc2626; text-align: center; margin-bottom: 25px; font-size: 24px;">❌ Заявка не одобрена</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 18px;">
        Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!<br>
        К сожалению, на данный момент ваша заявка была отклонена.<br>
        Не расстраивайтесь — вы всегда можете попробовать снова или задать вопросы нашей команде.
    </p>
    <div style="background: rgba(220,38,38,0.12); border-radius: 8px; padding: 20px; margin-bottom: 22px;">
        <p style="color: #f8b500; font-size: 15px; margin: 0 0 10px 0;"><b>Что делать дальше?</b></p>
        <ul style="font-size: 15px; color: #cbd5e1; padding-left: 18px; margin-bottom: 8px;">
            <li>💬 <a href="{{discordInvite}}" style="color: #dc2626; text-decoration: underline;">Discord для вопросов и обратной связи</a></li>
            <li>📱 <a href="{{telegramInvite}}" style="color: #dc2626; text-decoration: underline;">Telegram-чат поддержки</a></li>
            <li>📧 Если у вас есть вопросы, пишите нам на почту: <span style="color: #dc2626;">chiwawa.helper@yandex.ru</span></li>
        </ul>
        <p style="font-size: 14px; color: #cbd5e1; margin: 10px 0 0 0;">
            Вы всегда можете подать новую заявку после исправления возможных причин отказа.
        </p>
    </div>
    <p style="font-size: 15px; color: #f8b500; text-align: center; margin-bottom: 16px;">
        Спасибо за интерес к {{serverName}}. Мы будем рады видеть вас снова!
    </p>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0;">С уважением, команда {{serverName}}</p>
        <p style="margin: 13px 0 0 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', NULL, true, '2025-07-27 02:32:33.166931', '2025-07-28 02:30:49.153845', 1, NULL);
INSERT INTO public.email_templates VALUES (7, 'Приветственное письмо', 'Добро пожаловать на {{serverName}}!', '<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">{{serverName}}</h1>
        <p style="margin: 8px 0 0 0; color: #000; font-weight: 500;">Приватный Minecraft сервер</p>
    </div>
    <h2 style="color: #f59e0b; text-align: center; margin-bottom: 25px; font-size: 24px;">Добро пожаловать, {{nickname}}!</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        🎉 Поздравляем, ваша регистрация на нашем Minecraft сервере прошла успешно!<br>
        Мы рады видеть вас в нашем дружном сообществе.
    </p>
    <div style="background: rgba(30,41,59,0.7); border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #f59e0b; margin-top: 0;">Что дальше?</h3>
        <ul style="font-size: 15px; padding-left: 18px; margin-bottom: 10px;">
            <li>🔑 <b>Ваш никнейм:</b> <span style="color:#f8b500;">{{nickname}}</span></li>
            <li>⚡ <b>IP сервера:</b> <span style="color:#f8b500;">{{serverIp}}</span></li>
            <li>💬 <a href="{{discordInvite}}" style="color: #f59e0b; text-decoration: underline;">Присоединяйтесь к нашему Discord для чата, новостей и поддержки</a></li>
            <li>🛠 <a href="{{telegramInvite}}" style="color: #f59e0b; text-decoration: underline;">Так же присоединяйтесь к нашему Telegram каналу</a></li>
        </ul>
        <p style="font-size: 14px; color: #cbd5e1; margin-top: 12px;">
            Если у вас возникнут вопросы или сложности с входом, не стесняйтесь обращаться в поддержку через Discord/Telegram или на сайте.
        </p>
    </div>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0; color: #f8b500;">С уважением, команда {{serverName}}</p>
        <p style="margin: 15px 0 5px 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', NULL, true, '2025-07-27 02:32:32.838586', '2025-07-28 02:33:54.905482', 1, NULL);


--
-- TOC entry 3635 (class 0 OID 16929)
-- Dependencies: 219
-- Data for Name: email_verification_tokens; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.email_verification_tokens VALUES (1, 2, 'c050850d-4b9b-47ca-b67b-503d4082c0a3', '2025-07-29 23:55:06.47', '2025-07-28 20:55:04.842343', false);
INSERT INTO public.email_verification_tokens VALUES (2, 3, 'e200f4aa-4285-43e3-af7f-2c99146a8730', '2025-07-30 00:13:49.479', '2025-07-28 21:13:47.848298', false);


--
-- TOC entry 3632 (class 0 OID 16898)
-- Dependencies: 216
-- Data for Name: login_logs; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.login_logs VALUES (1, 1, '2025-07-26 06:04:15.047951', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true);
INSERT INTO public.login_logs VALUES (2, 1, '2025-07-26 16:17:54.54984', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true);
INSERT INTO public.login_logs VALUES (3, 1, '2025-07-26 20:35:13.034697', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true);
INSERT INTO public.login_logs VALUES (6, 1, '2025-07-28 16:35:52.47918', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true);
INSERT INTO public.login_logs VALUES (9, NULL, '2025-07-28 20:55:04.735316', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true);
INSERT INTO public.login_logs VALUES (10, 2, '2025-07-28 20:55:24.47596', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true);
INSERT INTO public.login_logs VALUES (11, NULL, '2025-07-28 21:13:47.743094', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; ru-RU) WindowsPowerShell/5.1.26100.4768', true);
INSERT INTO public.login_logs VALUES (12, 3, '2025-07-28 21:13:57.418056', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; ru-RU) WindowsPowerShell/5.1.26100.4768', true);


--
-- TOC entry 3659 (class 0 OID 17357)
-- Dependencies: 243
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: chiwawa
--



--
-- TOC entry 3630 (class 0 OID 16873)
-- Dependencies: 214
-- Data for Name: player_stats; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.player_stats VALUES (1, 0, 600, false, 3, 0, true, true, true, 1000, 0, 0, 0, '2025-07-26 05:12:51.073902', '2025-07-26 22:35:10.783374');
INSERT INTO public.player_stats VALUES (2, 0, 600, true, 0, 0, false, false, false, 0, 0, 0, 0, '2025-07-28 20:55:04.625519', '2025-07-28 20:55:04.625519');
INSERT INTO public.player_stats VALUES (3, 0, 600, true, 0, 0, false, false, false, 0, 0, 0, 0, '2025-07-28 21:13:47.637392', '2025-07-28 21:13:47.637392');


--
-- TOC entry 3655 (class 0 OID 17154)
-- Dependencies: 239
-- Data for Name: reputation_log; Type: TABLE DATA; Schema: public; Owner: chiwawa
--



--
-- TOC entry 3649 (class 0 OID 17039)
-- Dependencies: 233
-- Data for Name: server_rules; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.server_rules VALUES (1, 'Уважение к игрокам', 'Будьте вежливы и дружелюбны. Оскорбления и токсичность недопустимы.', 'behavior', 1, true, '2025-07-26 05:12:51.073902', '2025-07-26 05:12:51.073902');
INSERT INTO public.server_rules VALUES (2, 'Запрет на гриферство', 'Не разрушайте чужие постройки без разрешения. Уважайте труд других игроков.', 'gameplay', 2, true, '2025-07-26 05:12:51.073902', '2025-07-26 05:12:51.073902');
INSERT INTO public.server_rules VALUES (3, 'Честная игра', 'Использование читов, дюпов и эксплойтов запрещено. Играйте честно.', 'gameplay', 3, true, '2025-07-26 05:12:51.073902', '2025-07-26 05:12:51.073902');
INSERT INTO public.server_rules VALUES (4, 'Активность в сообществе', 'Участвуйте в жизни сервера, общайтесь в Discord, помогайте новичкам.', 'community', 4, true, '2025-07-26 05:12:51.073902', '2025-07-26 05:12:51.073902');
INSERT INTO public.server_rules VALUES (5, 'Возрастные ограничения', 'Сервер предназначен для игроков от 16 лет. Исключения только с разрешения администрации.', 'general', 5, true, '2025-07-26 05:12:51.073902', '2025-07-26 05:12:51.073902');


--
-- TOC entry 3661 (class 0 OID 17381)
-- Dependencies: 245
-- Data for Name: server_settings; Type: TABLE DATA; Schema: public; Owner: chiwawa
--

INSERT INTO public.server_settings VALUES (3, 'server-ip', 'play.chiwawa.site', 'string', 'general', 'IP адрес сервера', '2025-07-28 16:16:03.933439', '2025-07-28 16:16:03.933439', NULL);
INSERT INTO public.server_settings VALUES (4, 'server-port', '25565', 'integer', 'general', 'Порт сервера', '2025-07-28 16:16:04.041795', '2025-07-28 16:16:04.041795', NULL);
INSERT INTO public.server_settings VALUES (6, 'discord-invite', 'https://discord.gg/chiwawa', 'string', 'general', 'Ссылка на Discord сервер', '2025-07-28 16:16:04.525735', '2025-07-28 16:16:04.525735', NULL);
INSERT INTO public.server_settings VALUES (7, 'telegram-invite', 'https://t.me/chiwawa', 'string', 'general', 'Ссылка на Telegram канал', '2025-07-28 16:16:04.644731', '2025-07-28 16:16:04.644731', NULL);
INSERT INTO public.server_settings VALUES (8, 'maintenance-mode', 'false', 'boolean', 'system', 'Режим технического обслуживания', '2025-07-28 16:16:04.753294', '2025-07-28 16:16:04.753294', NULL);
INSERT INTO public.server_settings VALUES (9, 'registration-enabled', 'true', 'boolean', 'system', 'Разрешена ли регистрация новых пользователей', '2025-07-28 16:16:04.861966', '2025-07-28 16:16:04.861966', NULL);
INSERT INTO public.server_settings VALUES (10, 'auto-backup-enabled', 'true', 'boolean', 'system', 'Автоматическое создание резервных копий', '2025-07-28 16:16:04.970939', '2025-07-28 16:16:04.970939', NULL);
INSERT INTO public.server_settings VALUES (11, 'applications-enabled', 'true', 'boolean', 'applications', 'Прием заявок включен', '2025-07-28 16:16:05.079386', '2025-07-28 16:16:05.079386', NULL);
INSERT INTO public.server_settings VALUES (12, 'min-motivation-length', '50', 'integer', 'applications', 'Минимальная длина мотивации', '2025-07-28 16:16:05.187225', '2025-07-28 16:16:05.187225', NULL);
INSERT INTO public.server_settings VALUES (13, 'min-plans-length', '30', 'integer', 'applications', 'Минимальная длина планов', '2025-07-28 16:16:05.294691', '2025-07-28 16:16:05.294691', NULL);
INSERT INTO public.server_settings VALUES (14, 'max-applications-per-day', '3', 'integer', 'applications', 'Максимум заявок в день с одного IP', '2025-07-28 16:16:05.402156', '2025-07-28 16:16:05.402156', NULL);
INSERT INTO public.server_settings VALUES (15, 'auto-approve-trust-level', '2', 'integer', 'applications', 'Автоматическое одобрение при Trust Level', '2025-07-28 16:16:05.510408', '2025-07-28 16:16:05.510408', NULL);
INSERT INTO public.server_settings VALUES (16, 'trust-points-email', '50', 'integer', 'trust', 'Очки за подтверждение email', '2025-07-28 16:16:05.618823', '2025-07-28 16:16:05.618823', NULL);
INSERT INTO public.server_settings VALUES (17, 'trust-points-discord', '30', 'integer', 'trust', 'Очки за привязку Discord', '2025-07-28 16:16:05.72676', '2025-07-28 16:16:05.72676', NULL);
INSERT INTO public.server_settings VALUES (18, 'trust-points-hour', '5', 'integer', 'trust', 'Очки за час игры', '2025-07-28 16:16:05.848726', '2025-07-28 16:16:05.848726', NULL);
INSERT INTO public.server_settings VALUES (19, 'trust-level-1-required', '100', 'integer', 'trust', 'Очки для достижения Trust Level 1', '2025-07-28 16:16:05.956148', '2025-07-28 16:16:05.956148', NULL);
INSERT INTO public.server_settings VALUES (20, 'trust-level-2-required', '500', 'integer', 'trust', 'Очки для достижения Trust Level 2', '2025-07-28 16:16:06.064961', '2025-07-28 16:16:06.064961', NULL);
INSERT INTO public.server_settings VALUES (21, 'trust-level-3-required', '1500', 'integer', 'trust', 'Очки для достижения Trust Level 3', '2025-07-28 16:16:06.172535', '2025-07-28 16:16:06.172535', NULL);
INSERT INTO public.server_settings VALUES (22, 'max-login-attempts', '5', 'integer', 'security', 'Максимум попыток входа', '2025-07-28 16:16:06.280106', '2025-07-28 16:16:06.280106', NULL);
INSERT INTO public.server_settings VALUES (23, 'login-lockout-duration', '15', 'integer', 'security', 'Время блокировки в минутах', '2025-07-28 16:16:06.388661', '2025-07-28 16:16:06.388661', NULL);
INSERT INTO public.server_settings VALUES (24, 'jwt-expires-days', '30', 'integer', 'security', 'Время жизни JWT токена в днях', '2025-07-28 16:16:06.496859', '2025-07-28 16:16:06.496859', NULL);
INSERT INTO public.server_settings VALUES (25, 'require-email-verification', 'true', 'boolean', 'security', 'Требовать подтверждение email', '2025-07-28 16:16:06.615735', '2025-07-28 16:16:06.615735', NULL);
INSERT INTO public.server_settings VALUES (26, 'two-factor-enabled', 'false', 'boolean', 'security', 'Двухфакторная аутентификация', '2025-07-28 16:16:06.72424', '2025-07-28 16:16:06.72424', NULL);
INSERT INTO public.server_settings VALUES (27, 'rate-limit-requests', '100', 'integer', 'security', 'Лимит запросов в минуту', '2025-07-28 16:16:06.833711', '2025-07-28 16:16:06.833711', NULL);
INSERT INTO public.server_settings VALUES (28, 'smtp-host', 'smtp.yandex.ru', 'string', 'email', 'SMTP сервер', '2025-07-28 16:16:06.943312', '2025-07-28 16:16:06.943312', NULL);
INSERT INTO public.server_settings VALUES (29, 'smtp-port', '465', 'integer', 'email', 'SMTP порт', '2025-07-28 16:16:07.051303', '2025-07-28 16:16:07.051303', NULL);
INSERT INTO public.server_settings VALUES (30, 'smtp-from', 'noreply@chiwawa.site', 'string', 'email', 'Email отправителя', '2025-07-28 16:16:07.161148', '2025-07-28 16:16:07.161148', NULL);
INSERT INTO public.server_settings VALUES (31, 'smtp-user', '', 'string', 'email', 'SMTP пользователь', '2025-07-28 16:16:07.26863', '2025-07-28 16:16:07.26863', NULL);
INSERT INTO public.server_settings VALUES (32, 'smtp-password', '', 'string', 'email', 'SMTP пароль', '2025-07-28 16:16:07.376868', '2025-07-28 16:16:07.376868', NULL);
INSERT INTO public.server_settings VALUES (33, 'smtp-tls', 'true', 'boolean', 'email', 'Использовать TLS/SSL', '2025-07-28 16:16:07.484978', '2025-07-28 16:16:07.484978', NULL);
INSERT INTO public.server_settings VALUES (34, 'smtp-sender-name', 'ChiwawaMine', 'string', 'email', 'Имя отправителя', '2025-07-28 16:16:07.593427', '2025-07-28 16:16:07.593427', NULL);
INSERT INTO public.server_settings VALUES (35, 'smtp-reply-to', '', 'string', 'email', 'Reply-To адрес', '2025-07-28 16:16:07.701636', '2025-07-28 16:16:07.701636', NULL);
INSERT INTO public.server_settings VALUES (36, 'email-notifications-enabled', 'true', 'boolean', 'email', 'Email уведомления включены', '2025-07-28 16:16:07.809582', '2025-07-28 16:16:07.809582', NULL);
INSERT INTO public.server_settings VALUES (37, 'smtp-timeout', '30', 'integer', 'email', 'Тайм-аут SMTP в секундах', '2025-07-28 16:16:07.91732', '2025-07-28 16:16:07.91732', NULL);
INSERT INTO public.server_settings VALUES (1, 'server-name', 'ChiwawaMine', 'string', 'general', 'Название сервера', '2025-07-28 16:16:03.682039', '2025-07-28 16:20:38.77883', NULL);
INSERT INTO public.server_settings VALUES (2, 'server-description', 'Лучший Minecraft сервер с дружелюбным сообществом', 'string', 'general', 'Описание сервера', '2025-07-28 16:16:03.792825', '2025-07-28 16:20:38.885209', NULL);
INSERT INTO public.server_settings VALUES (5, 'max-players', '100', 'integer', 'general', 'Максимальное количество игроков', '2025-07-28 16:16:04.416983', '2025-07-28 16:20:38.991868', NULL);


--
-- TOC entry 3647 (class 0 OID 17026)
-- Dependencies: 231
-- Data for Name: server_status; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.server_status VALUES (1, false, 0, 20, '1.20.4', 'Добро пожаловать на Chiwawa Server!', '2025-07-26 05:12:51.073902');


--
-- TOC entry 3651 (class 0 OID 17102)
-- Dependencies: 235
-- Data for Name: trust_level_applications; Type: TABLE DATA; Schema: public; Owner: chiwawa
--



--
-- TOC entry 3645 (class 0 OID 17006)
-- Dependencies: 229
-- Data for Name: user_achievements; Type: TABLE DATA; Schema: public; Owner: root
--



--
-- TOC entry 3639 (class 0 OID 16958)
-- Dependencies: 223
-- Data for Name: user_activity; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.user_activity VALUES (1, 1, 'login', 'Вход в систему', NULL, '::1', '2025-07-26 06:04:15.154537');
INSERT INTO public.user_activity VALUES (2, 1, 'login', 'Вход в систему', NULL, '::1', '2025-07-26 16:17:54.568696');
INSERT INTO public.user_activity VALUES (3, 1, 'login', 'Вход в систему', NULL, '::1', '2025-07-26 20:35:13.141596');
INSERT INTO public.user_activity VALUES (6, 1, 'logout', 'Выход из системы', NULL, '::1', '2025-07-28 16:35:46.642749');
INSERT INTO public.user_activity VALUES (7, 1, 'logout', 'Выход из системы', NULL, '::1', '2025-07-28 16:35:46.651292');
INSERT INTO public.user_activity VALUES (8, 1, 'login', 'Вход в систему', NULL, '::1', '2025-07-28 16:35:52.588342');
INSERT INTO public.user_activity VALUES (10, 2, 'login', 'Вход в систему', NULL, '::1', '2025-07-28 20:55:24.579807');
INSERT INTO public.user_activity VALUES (11, 3, 'login', 'Вход в систему', NULL, '::1', '2025-07-28 21:13:57.529856');


--
-- TOC entry 3653 (class 0 OID 17128)
-- Dependencies: 237
-- Data for Name: user_reputation; Type: TABLE DATA; Schema: public; Owner: chiwawa
--

INSERT INTO public.user_reputation VALUES (1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '2025-07-26 14:18:35.849501', '2025-07-26 14:18:35.849501');


--
-- TOC entry 3633 (class 0 OID 16913)
-- Dependencies: 217
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.user_sessions VALUES ('413ed831-833e-481d-bad1-c125107f0989', 1, 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qRXNJbVZ0WVdsc0lqb2laR2x0WVRKZk1EVkFiV0ZwYkM1eWRTSXNJbkp2YkdVaU9pSmhaRzFwYmlJc0ltbGhkQ0k2TVRjMU16VXdPVGcxTkN3aVpYaHdJam94TnpVMk1UQXhPRFUwZlEuQmdfdUtObEFtc3ktak93M1hCVHFnaThzSzFuVVlBUUJTYlFhNnQ0WkVDaw==', '2025-08-25 09:04:14.253', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true, '2025-07-26 06:04:14.833344');
INSERT INTO public.user_sessions VALUES ('a71000eb-fa83-424c-87b3-53ea1b0c8f5d', 1, 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qRXNJbVZ0WVdsc0lqb2laR2x0WVRKZk1EVkFiV0ZwYkM1eWRTSXNJbkp2YkdVaU9pSmhaRzFwYmlJc0ltbGhkQ0k2TVRjMU16VTBOalkzTXl3aVpYaHdJam94TnpVMk1UTTROamN6ZlEuVVYzbDFOcGdsY3hhSjAxVXdUNERIdEprN0hrcF9TSENwdktpek95Y2FtMA==', '2025-08-25 19:17:53.999', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true, '2025-07-26 16:17:54.509684');
INSERT INTO public.user_sessions VALUES ('e2cdbc47-c757-4773-be9c-c75a5e05193b', 1, 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qRXNJbVZ0WVdsc0lqb2laR2x0WVRKZk1EVkFiV0ZwYkM1eWRTSXNJbkp2YkdVaU9pSmhaRzFwYmlJc0ltbGhkQ0k2TVRjMU16VTJNakV4TWl3aVpYaHdJam94TnpVMk1UVTBNVEV5ZlEucWhxRkdfYVpVZzl5TUVnSkhJemplRXNhSE4xaXFfMTJyZ2tuUVc4YzVZOA==', '2025-08-25 23:35:12.283', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', false, '2025-07-26 20:35:12.819451');
INSERT INTO public.user_sessions VALUES ('7f4dd2ee-43b0-492c-a359-92839bac38c7', 1, 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qRXNJbVZ0WVdsc0lqb2laR2x0WVRKZk1EVkFiV0ZwYkM1eWRTSXNJbkp2YkdVaU9pSmhaRzFwYmlJc0ltbGhkQ0k2TVRjMU16Y3lNRFUxTXl3aVpYaHdJam94TnpVMk16RXlOVFV6ZlEudUVxWjh0UERFd3RvcGpidTI5eFh2V1Z3a1ZVM0p5LVBDY3NMZ01SeGI3bw==', '2025-08-27 19:35:53.895', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true, '2025-07-28 16:35:52.257701');
INSERT INTO public.user_sessions VALUES ('bcea3ef6-cc04-4ed2-9987-fd46dae516ce', 2, 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qSXNJbVZ0WVdsc0lqb2ljMmhoWkc5M1oyRnRaWE5pYkdGamEzUjFZbVZBWjIxaGFXd3VZMjl0SWl3aWNtOXNaU0k2SW5WelpYSWlMQ0pwWVhRaU9qRTNOVE0zTXpZeE1qVXNJbVY0Y0NJNk1UYzFNemd5TWpVeU5YMC5LRWpUQ29BdHE1VFRDdGZaRWd2SVpucE9xX3JZSnhYWGhtV29SSEIwc04w', '2025-07-29 23:55:25.892', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36', true, '2025-07-28 20:55:24.264178');
INSERT INTO public.user_sessions VALUES ('ad97414e-0e4e-4164-8729-5b5b02184475', 3, 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qTXNJbVZ0WVdsc0lqb2lkR1Z6ZEVCbGVHRnRjR3hsTG1OdmJTSXNJbkp2YkdVaU9pSjFjMlZ5SWl3aWFXRjBJam94TnpVek56TTNNak00TENKbGVIQWlPakUzTlRNNE1qTTJNemg5LkVNS2g0VktUNnV2NDcyeldnS0pTdFdHOGVtbXN1RXNtc2o3ZjZXekQ2bEk=', '2025-07-30 00:13:58.838', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; ru-RU) WindowsPowerShell/5.1.26100.4768', true, '2025-07-28 21:13:57.207429');


--
-- TOC entry 3627 (class 0 OID 16829)
-- Dependencies: 211
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: root
--

INSERT INTO public.users VALUES (1, 'ebluffy', 'dima2_05@mail.ru', '$2a$12$Wp8pSrr9R1tPyaT7BUW4RuIT2Kdt1YdEWdsrL.J3vvSs6p/am39o2', 'Дмитрий', NULL, NULL, 'Администратор', NULL, NULL, NULL, NULL, 'admin', 3, 'active', true, true, false, '2025-07-26 05:12:51.073902', '2025-07-28 16:35:52.365992', NULL);
INSERT INTO public.users VALUES (2, 'shadow', 'shadowgamesblacktube@gmail.com', '$2a$12$FHQHejBO/08A5AXpOQ1J0OUS6JAjfhBceefqAYKjD1IOX9.Ppj.ri', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'user', 0, 'active', true, false, false, '2025-07-28 20:55:04.515725', '2025-07-28 20:55:24.371281', NULL);
INSERT INTO public.users VALUES (3, 'TestUser123', 'test@example.com', '$2a$12$Ed3Ua3mJ/eXXO.e6l/wHK.0ZH8/m4qQQMi4u81ED7M/SKKd5Rc0ZS', 'Test', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'user', 0, 'active', true, false, false, '2025-07-28 21:13:47.528758', '2025-07-28 21:13:57.313929', NULL);


--
-- TOC entry 3687 (class 0 OID 0)
-- Dependencies: 226
-- Name: achievements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.achievements_id_seq', 8, true);


--
-- TOC entry 3688 (class 0 OID 0)
-- Dependencies: 224
-- Name: admin_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.admin_logs_id_seq', 128, true);


--
-- TOC entry 3689 (class 0 OID 0)
-- Dependencies: 212
-- Name: applications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.applications_id_seq', 1, false);


--
-- TOC entry 3690 (class 0 OID 0)
-- Dependencies: 220
-- Name: discord_oauth_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.discord_oauth_id_seq', 1, false);


--
-- TOC entry 3691 (class 0 OID 0)
-- Dependencies: 240
-- Name: email_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.email_templates_id_seq', 12, true);


--
-- TOC entry 3692 (class 0 OID 0)
-- Dependencies: 218
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.email_verification_tokens_id_seq', 2, true);


--
-- TOC entry 3693 (class 0 OID 0)
-- Dependencies: 215
-- Name: login_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.login_logs_id_seq', 12, true);


--
-- TOC entry 3694 (class 0 OID 0)
-- Dependencies: 242
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.password_reset_tokens_id_seq', 1, false);


--
-- TOC entry 3695 (class 0 OID 0)
-- Dependencies: 238
-- Name: reputation_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.reputation_log_id_seq', 1, false);


--
-- TOC entry 3696 (class 0 OID 0)
-- Dependencies: 232
-- Name: server_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.server_rules_id_seq', 5, true);


--
-- TOC entry 3697 (class 0 OID 0)
-- Dependencies: 244
-- Name: server_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.server_settings_id_seq', 38, true);


--
-- TOC entry 3698 (class 0 OID 0)
-- Dependencies: 230
-- Name: server_status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.server_status_id_seq', 1, true);


--
-- TOC entry 3699 (class 0 OID 0)
-- Dependencies: 234
-- Name: trust_level_applications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.trust_level_applications_id_seq', 1, false);


--
-- TOC entry 3700 (class 0 OID 0)
-- Dependencies: 228
-- Name: user_achievements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.user_achievements_id_seq', 1, false);


--
-- TOC entry 3701 (class 0 OID 0)
-- Dependencies: 222
-- Name: user_activity_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.user_activity_id_seq', 11, true);


--
-- TOC entry 3702 (class 0 OID 0)
-- Dependencies: 236
-- Name: user_reputation_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.user_reputation_id_seq', 1, true);


--
-- TOC entry 3703 (class 0 OID 0)
-- Dependencies: 210
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- TOC entry 3422 (class 2606 OID 17004)
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- TOC entry 3417 (class 2606 OID 16981)
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 3384 (class 2606 OID 16862)
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- TOC entry 3410 (class 2606 OID 16951)
-- Name: discord_oauth discord_oauth_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.discord_oauth
    ADD CONSTRAINT discord_oauth_pkey PRIMARY KEY (id);


--
-- TOC entry 3446 (class 2606 OID 17321)
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 3448 (class 2606 OID 17323)
-- Name: email_templates email_templates_template_name_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_template_name_key UNIQUE (template_name);


--
-- TOC entry 3403 (class 2606 OID 16936)
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 3405 (class 2606 OID 16938)
-- Name: email_verification_tokens email_verification_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_key UNIQUE (token);


--
-- TOC entry 3396 (class 2606 OID 16907)
-- Name: login_logs login_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 3455 (class 2606 OID 17364)
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 3457 (class 2606 OID 17366)
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- TOC entry 3391 (class 2606 OID 16891)
-- Name: player_stats player_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.player_stats
    ADD CONSTRAINT player_stats_pkey PRIMARY KEY (user_id);


--
-- TOC entry 3444 (class 2606 OID 17162)
-- Name: reputation_log reputation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.reputation_log
    ADD CONSTRAINT reputation_log_pkey PRIMARY KEY (id);


--
-- TOC entry 3432 (class 2606 OID 17051)
-- Name: server_rules server_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.server_rules
    ADD CONSTRAINT server_rules_pkey PRIMARY KEY (id);


--
-- TOC entry 3459 (class 2606 OID 17392)
-- Name: server_settings server_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.server_settings
    ADD CONSTRAINT server_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 3461 (class 2606 OID 17394)
-- Name: server_settings server_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.server_settings
    ADD CONSTRAINT server_settings_setting_key_key UNIQUE (setting_key);


--
-- TOC entry 3430 (class 2606 OID 17037)
-- Name: server_status server_status_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.server_status
    ADD CONSTRAINT server_status_pkey PRIMARY KEY (id);


--
-- TOC entry 3436 (class 2606 OID 17116)
-- Name: trust_level_applications trust_level_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.trust_level_applications
    ADD CONSTRAINT trust_level_applications_pkey PRIMARY KEY (id);


--
-- TOC entry 3426 (class 2606 OID 17012)
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- TOC entry 3428 (class 2606 OID 17014)
-- Name: user_achievements user_achievements_user_id_achievement_id_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_achievement_id_key UNIQUE (user_id, achievement_id);


--
-- TOC entry 3415 (class 2606 OID 16966)
-- Name: user_activity user_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_pkey PRIMARY KEY (id);


--
-- TOC entry 3439 (class 2606 OID 17145)
-- Name: user_reputation user_reputation_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.user_reputation
    ADD CONSTRAINT user_reputation_pkey PRIMARY KEY (id);


--
-- TOC entry 3441 (class 2606 OID 17147)
-- Name: user_reputation user_reputation_user_id_key; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.user_reputation
    ADD CONSTRAINT user_reputation_user_id_key UNIQUE (user_id);


--
-- TOC entry 3401 (class 2606 OID 16922)
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 3378 (class 2606 OID 16850)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 3380 (class 2606 OID 16848)
-- Name: users users_nickname_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_nickname_key UNIQUE (nickname);


--
-- TOC entry 3382 (class 2606 OID 16846)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3418 (class 1259 OID 17090)
-- Name: idx_admin_logs_admin_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_admin_logs_admin_id ON public.admin_logs USING btree (admin_id);


--
-- TOC entry 3419 (class 1259 OID 17092)
-- Name: idx_admin_logs_created_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_admin_logs_created_at ON public.admin_logs USING btree (created_at);


--
-- TOC entry 3420 (class 1259 OID 17091)
-- Name: idx_admin_logs_target_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_admin_logs_target_user_id ON public.admin_logs USING btree (target_user_id);


--
-- TOC entry 3385 (class 1259 OID 17073)
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_applications_status ON public.applications USING btree (status);


--
-- TOC entry 3386 (class 1259 OID 17074)
-- Name: idx_applications_submitted_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_applications_submitted_at ON public.applications USING btree (submitted_at);


--
-- TOC entry 3387 (class 1259 OID 17075)
-- Name: idx_applications_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_applications_user_id ON public.applications USING btree (user_id);


--
-- TOC entry 3449 (class 1259 OID 17332)
-- Name: idx_email_templates_active; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_email_templates_active ON public.email_templates USING btree (is_active);


--
-- TOC entry 3450 (class 1259 OID 17331)
-- Name: idx_email_templates_name; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_email_templates_name ON public.email_templates USING btree (template_name);


--
-- TOC entry 3406 (class 1259 OID 17086)
-- Name: idx_email_verification_tokens_expires_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_email_verification_tokens_expires_at ON public.email_verification_tokens USING btree (expires_at);


--
-- TOC entry 3407 (class 1259 OID 17085)
-- Name: idx_email_verification_tokens_token; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_email_verification_tokens_token ON public.email_verification_tokens USING btree (token);


--
-- TOC entry 3408 (class 1259 OID 17084)
-- Name: idx_email_verification_tokens_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_email_verification_tokens_user_id ON public.email_verification_tokens USING btree (user_id);


--
-- TOC entry 3392 (class 1259 OID 17080)
-- Name: idx_login_logs_ip_address; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_login_logs_ip_address ON public.login_logs USING btree (ip_address);


--
-- TOC entry 3393 (class 1259 OID 17079)
-- Name: idx_login_logs_login_time; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_login_logs_login_time ON public.login_logs USING btree (login_time);


--
-- TOC entry 3394 (class 1259 OID 17078)
-- Name: idx_login_logs_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_login_logs_user_id ON public.login_logs USING btree (user_id);


--
-- TOC entry 3451 (class 1259 OID 17374)
-- Name: idx_password_reset_tokens_expires_at; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_password_reset_tokens_expires_at ON public.password_reset_tokens USING btree (expires_at);


--
-- TOC entry 3452 (class 1259 OID 17373)
-- Name: idx_password_reset_tokens_token; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);


--
-- TOC entry 3453 (class 1259 OID 17372)
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- TOC entry 3388 (class 1259 OID 17077)
-- Name: idx_player_stats_current_level; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_player_stats_current_level ON public.player_stats USING btree (current_level);


--
-- TOC entry 3389 (class 1259 OID 17076)
-- Name: idx_player_stats_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_player_stats_user_id ON public.player_stats USING btree (user_id);


--
-- TOC entry 3442 (class 1259 OID 17178)
-- Name: idx_reputation_log_user_id; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_reputation_log_user_id ON public.reputation_log USING btree (user_id);


--
-- TOC entry 3433 (class 1259 OID 17176)
-- Name: idx_trust_level_applications_status; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_trust_level_applications_status ON public.trust_level_applications USING btree (status);


--
-- TOC entry 3434 (class 1259 OID 17175)
-- Name: idx_trust_level_applications_user_id; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_trust_level_applications_user_id ON public.trust_level_applications USING btree (user_id);


--
-- TOC entry 3423 (class 1259 OID 17094)
-- Name: idx_user_achievements_achievement_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_achievements_achievement_id ON public.user_achievements USING btree (achievement_id);


--
-- TOC entry 3424 (class 1259 OID 17093)
-- Name: idx_user_achievements_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_achievements_user_id ON public.user_achievements USING btree (user_id);


--
-- TOC entry 3411 (class 1259 OID 17088)
-- Name: idx_user_activity_created_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_activity_created_at ON public.user_activity USING btree (created_at);


--
-- TOC entry 3412 (class 1259 OID 17089)
-- Name: idx_user_activity_type; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_activity_type ON public.user_activity USING btree (activity_type);


--
-- TOC entry 3413 (class 1259 OID 17087)
-- Name: idx_user_activity_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_activity_user_id ON public.user_activity USING btree (user_id);


--
-- TOC entry 3437 (class 1259 OID 17177)
-- Name: idx_user_reputation_user_id; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_user_reputation_user_id ON public.user_reputation USING btree (user_id);


--
-- TOC entry 3397 (class 1259 OID 17083)
-- Name: idx_user_sessions_expires_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions USING btree (expires_at);


--
-- TOC entry 3398 (class 1259 OID 17100)
-- Name: idx_user_sessions_token_hash; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_sessions_token_hash ON public.user_sessions USING btree (token_hash);


--
-- TOC entry 3399 (class 1259 OID 17081)
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- TOC entry 3370 (class 1259 OID 17072)
-- Name: idx_users_discord_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_discord_id ON public.users USING btree (discord_id);


--
-- TOC entry 3371 (class 1259 OID 17066)
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- TOC entry 3372 (class 1259 OID 17067)
-- Name: idx_users_nickname; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_nickname ON public.users USING btree (nickname);


--
-- TOC entry 3373 (class 1259 OID 17071)
-- Name: idx_users_registered_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_registered_at ON public.users USING btree (registered_at);


--
-- TOC entry 3374 (class 1259 OID 17068)
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- TOC entry 3375 (class 1259 OID 17070)
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- TOC entry 3376 (class 1259 OID 17069)
-- Name: idx_users_trust_level; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_trust_level ON public.users USING btree (trust_level);


--
-- TOC entry 3486 (class 2620 OID 17334)
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: root
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3483 (class 2620 OID 17097)
-- Name: player_stats update_player_stats_updated_at; Type: TRIGGER; Schema: public; Owner: root
--

CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON public.player_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3485 (class 2620 OID 17096)
-- Name: server_rules update_server_rules_updated_at; Type: TRIGGER; Schema: public; Owner: root
--

CREATE TRIGGER update_server_rules_updated_at BEFORE UPDATE ON public.server_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3484 (class 2620 OID 17098)
-- Name: server_status update_server_status_updated_at; Type: TRIGGER; Schema: public; Owner: root
--

CREATE TRIGGER update_server_status_updated_at BEFORE UPDATE ON public.server_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3470 (class 2606 OID 16982)
-- Name: admin_logs admin_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 3471 (class 2606 OID 16987)
-- Name: admin_logs admin_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 3463 (class 2606 OID 16868)
-- Name: applications applications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- TOC entry 3462 (class 2606 OID 16863)
-- Name: applications applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3468 (class 2606 OID 16952)
-- Name: discord_oauth discord_oauth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.discord_oauth
    ADD CONSTRAINT discord_oauth_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3479 (class 2606 OID 17335)
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 3480 (class 2606 OID 17324)
-- Name: email_templates email_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 3467 (class 2606 OID 16939)
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3465 (class 2606 OID 16908)
-- Name: login_logs login_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3481 (class 2606 OID 17367)
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3464 (class 2606 OID 16892)
-- Name: player_stats player_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.player_stats
    ADD CONSTRAINT player_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3478 (class 2606 OID 17168)
-- Name: reputation_log reputation_log_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.reputation_log
    ADD CONSTRAINT reputation_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- TOC entry 3477 (class 2606 OID 17163)
-- Name: reputation_log reputation_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.reputation_log
    ADD CONSTRAINT reputation_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3482 (class 2606 OID 17395)
-- Name: server_settings server_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.server_settings
    ADD CONSTRAINT server_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 3475 (class 2606 OID 17122)
-- Name: trust_level_applications trust_level_applications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.trust_level_applications
    ADD CONSTRAINT trust_level_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- TOC entry 3474 (class 2606 OID 17117)
-- Name: trust_level_applications trust_level_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.trust_level_applications
    ADD CONSTRAINT trust_level_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3473 (class 2606 OID 17020)
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;


--
-- TOC entry 3472 (class 2606 OID 17015)
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3469 (class 2606 OID 16967)
-- Name: user_activity user_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3476 (class 2606 OID 17148)
-- Name: user_reputation user_reputation_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.user_reputation
    ADD CONSTRAINT user_reputation_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3466 (class 2606 OID 16923)
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Completed on 2025-07-28 21:21:13 UTC

--
-- PostgreSQL database dump complete
--

