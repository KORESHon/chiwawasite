--
-- PostgreSQL database dump
--

-- Dumped from database version 14.18 (Ubuntu 14.18-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.18 (Ubuntu 14.18-0ubuntu0.22.04.1)

-- Started on 2025-07-26 23:37:17 UTC

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
-- TOC entry 3636 (class 0 OID 0)
-- Dependencies: 4
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 265 (class 1255 OID 17173)
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
-- TOC entry 266 (class 1255 OID 17174)
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
-- TOC entry 253 (class 1255 OID 17095)
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
-- TOC entry 3637 (class 0 OID 0)
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
-- TOC entry 3638 (class 0 OID 0)
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
-- TOC entry 3639 (class 0 OID 0)
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
-- TOC entry 3640 (class 0 OID 0)
-- Dependencies: 220
-- Name: discord_oauth_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.discord_oauth_id_seq OWNED BY public.discord_oauth.id;


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
-- TOC entry 3641 (class 0 OID 0)
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
-- TOC entry 3642 (class 0 OID 0)
-- Dependencies: 215
-- Name: login_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.login_logs_id_seq OWNED BY public.login_logs.id;


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
-- TOC entry 240 (class 1259 OID 17154)
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
-- TOC entry 239 (class 1259 OID 17153)
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
-- TOC entry 3643 (class 0 OID 0)
-- Dependencies: 239
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
-- TOC entry 3644 (class 0 OID 0)
-- Dependencies: 232
-- Name: server_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.server_rules_id_seq OWNED BY public.server_rules.id;


--
-- TOC entry 242 (class 1259 OID 17180)
-- Name: server_settings; Type: TABLE; Schema: public; Owner: chiwawa
--

CREATE TABLE public.server_settings (
    id integer NOT NULL,
    setting_key character varying(50) NOT NULL,
    setting_value text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by integer
);


ALTER TABLE public.server_settings OWNER TO chiwawa;

--
-- TOC entry 241 (class 1259 OID 17179)
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
-- TOC entry 3645 (class 0 OID 0)
-- Dependencies: 241
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
-- TOC entry 3646 (class 0 OID 0)
-- Dependencies: 230
-- Name: server_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.server_status_id_seq OWNED BY public.server_status.id;


--
-- TOC entry 234 (class 1259 OID 17052)
-- Name: site_settings; Type: TABLE; Schema: public; Owner: root
--

CREATE TABLE public.site_settings (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    category character varying(50) DEFAULT 'general'::character varying,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.site_settings OWNER TO root;

--
-- TOC entry 236 (class 1259 OID 17102)
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
-- TOC entry 235 (class 1259 OID 17101)
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
-- TOC entry 3647 (class 0 OID 0)
-- Dependencies: 235
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
-- TOC entry 3648 (class 0 OID 0)
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
-- TOC entry 3649 (class 0 OID 0)
-- Dependencies: 222
-- Name: user_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.user_activity_id_seq OWNED BY public.user_activity.id;


--
-- TOC entry 238 (class 1259 OID 17128)
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
-- TOC entry 237 (class 1259 OID 17127)
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
-- TOC entry 3650 (class 0 OID 0)
-- Dependencies: 237
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
-- TOC entry 3651 (class 0 OID 0)
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
-- TOC entry 3652 (class 0 OID 0)
-- Dependencies: 210
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: root
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 3311 (class 2604 OID 16996)
-- Name: achievements id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.achievements ALTER COLUMN id SET DEFAULT nextval('public.achievements_id_seq'::regclass);


--
-- TOC entry 3309 (class 2604 OID 16976)
-- Name: admin_logs id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.admin_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_logs_id_seq'::regclass);


--
-- TOC entry 3278 (class 2604 OID 16855)
-- Name: applications id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.applications ALTER COLUMN id SET DEFAULT nextval('public.applications_id_seq'::regclass);


--
-- TOC entry 3305 (class 2604 OID 16948)
-- Name: discord_oauth id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.discord_oauth ALTER COLUMN id SET DEFAULT nextval('public.discord_oauth_id_seq'::regclass);


--
-- TOC entry 3302 (class 2604 OID 16932)
-- Name: email_verification_tokens id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_verification_tokens ALTER COLUMN id SET DEFAULT nextval('public.email_verification_tokens_id_seq'::regclass);


--
-- TOC entry 3296 (class 2604 OID 16901)
-- Name: login_logs id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.login_logs ALTER COLUMN id SET DEFAULT nextval('public.login_logs_id_seq'::regclass);


--
-- TOC entry 3352 (class 2604 OID 17157)
-- Name: reputation_log id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.reputation_log ALTER COLUMN id SET DEFAULT nextval('public.reputation_log_id_seq'::regclass);


--
-- TOC entry 3323 (class 2604 OID 17042)
-- Name: server_rules id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.server_rules ALTER COLUMN id SET DEFAULT nextval('public.server_rules_id_seq'::regclass);


--
-- TOC entry 3354 (class 2604 OID 17183)
-- Name: server_settings id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.server_settings ALTER COLUMN id SET DEFAULT nextval('public.server_settings_id_seq'::regclass);


--
-- TOC entry 3319 (class 2604 OID 17029)
-- Name: server_status id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.server_status ALTER COLUMN id SET DEFAULT nextval('public.server_status_id_seq'::regclass);


--
-- TOC entry 3331 (class 2604 OID 17105)
-- Name: trust_level_applications id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.trust_level_applications ALTER COLUMN id SET DEFAULT nextval('public.trust_level_applications_id_seq'::regclass);


--
-- TOC entry 3316 (class 2604 OID 17009)
-- Name: user_achievements id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements ALTER COLUMN id SET DEFAULT nextval('public.user_achievements_id_seq'::regclass);


--
-- TOC entry 3307 (class 2604 OID 16961)
-- Name: user_activity id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_activity ALTER COLUMN id SET DEFAULT nextval('public.user_activity_id_seq'::regclass);


--
-- TOC entry 3339 (class 2604 OID 17131)
-- Name: user_reputation id; Type: DEFAULT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.user_reputation ALTER COLUMN id SET DEFAULT nextval('public.user_reputation_id_seq'::regclass);


--
-- TOC entry 3267 (class 2604 OID 16832)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 3615 (class 0 OID 16993)
-- Dependencies: 227
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.achievements (id, name, description, icon, points, category, is_active, created_at) FROM stdin;
1	Первый вход	Впервые зашли на сервер	star	10	milestone	t	2025-07-26 05:12:51.073902
2	Новичок	Играли 1 час	clock	20	playtime	t	2025-07-26 05:12:51.073902
3	Активный игрок	Играли 10 часов	trophy	50	playtime	t	2025-07-26 05:12:51.073902
4	Ветеран	Играли 100 часов	crown	100	playtime	t	2025-07-26 05:12:51.073902
5	Подтвержденный	Подтвердили email адрес	check-circle	30	verification	t	2025-07-26 05:12:51.073902
6	Социальный	Привязали Discord аккаунт	discord	25	social	t	2025-07-26 05:12:51.073902
7	Строитель	Построили свой первый дом	home	40	building	t	2025-07-26 05:12:51.073902
8	Исследователь	Прошли 10,000 блоков	map	60	exploration	t	2025-07-26 05:12:51.073902
\.


--
-- TOC entry 3613 (class 0 OID 16973)
-- Dependencies: 225
-- Data for Name: admin_logs; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.admin_logs (id, admin_id, action, target_user_id, details, ip_address, created_at) FROM stdin;
1	1	settings_updated	\N	Настройки сервера обновлены: server_name	\N	2025-07-26 14:36:29.249472
2	1	settings_updated	\N	Настройки сервера обновлены: server_name	\N	2025-07-26 14:38:46.644086
3	1	settings_updated	\N	Настройки сервера обновлены: 	\N	2025-07-26 19:29:40.045455
4	1	trust_level_changed	1	Уровень доверия ebluffy изменен с 5 на 3: Админ	\N	2025-07-26 20:23:29.440632
5	1	settings_updated	\N	Настройки сервера обновлены через админ-панель	\N	2025-07-26 21:07:21.32828
6	1	settings_updated	\N	Настройки сервера обновлены: 	\N	2025-07-26 21:07:21.426516
7	1	trust_level_changed	1	Уровень доверия ebluffy изменен с 3 на 3: да	\N	2025-07-26 22:35:10.892645
8	1	settings_updated	\N	Настройки сервера обновлены через админ-панель	\N	2025-07-26 23:21:14.171374
9	1	settings_updated	\N	Настройки сервера обновлены: 	\N	2025-07-26 23:21:14.709568
10	1	trust_level_changed	2	Уровень доверия KORESHon изменен с 0 на 1: 1	\N	2025-07-26 23:21:57.766367
11	1	role_changed	2	Роль пользователя KORESHon изменена с user на moderator	\N	2025-07-26 23:22:10.326156
12	1	role_changed	2	Роль пользователя KORESHon изменена с moderator на user	\N	2025-07-26 23:30:44.054452
13	1	role_changed	2	Роль пользователя KORESHon изменена с user на moderator	\N	2025-07-26 23:30:46.910976
\.


--
-- TOC entry 3601 (class 0 OID 16852)
-- Dependencies: 213
-- Data for Name: applications; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.applications (id, user_id, minecraft_nick, age, discord, email, experience, motivation, plans, status, submitted_at, reviewed_at, reviewed_by, review_comment, ip_address, user_agent) FROM stdin;
\.


--
-- TOC entry 3609 (class 0 OID 16945)
-- Dependencies: 221
-- Data for Name: discord_oauth; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.discord_oauth (id, user_id, access_token, refresh_token, expires_at, discord_username, discord_discriminator, created_at) FROM stdin;
\.


--
-- TOC entry 3607 (class 0 OID 16929)
-- Dependencies: 219
-- Data for Name: email_verification_tokens; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.email_verification_tokens (id, user_id, token, expires_at, created_at, used) FROM stdin;
\.


--
-- TOC entry 3604 (class 0 OID 16898)
-- Dependencies: 216
-- Data for Name: login_logs; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.login_logs (id, user_id, login_time, ip_address, user_agent, success) FROM stdin;
1	1	2025-07-26 06:04:15.047951	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36	t
2	1	2025-07-26 16:17:54.54984	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36	t
3	1	2025-07-26 20:35:13.034697	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36	t
4	2	2025-07-26 23:20:40.909757	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36	t
\.


--
-- TOC entry 3602 (class 0 OID 16873)
-- Dependencies: 214
-- Data for Name: player_stats; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.player_stats (user_id, total_minutes, daily_limit_minutes, is_time_limited, current_level, time_played_minutes, email_verified, discord_verified, minecraft_verified, reputation, achievements_count, total_logins, warnings_count, last_update, updated_at) FROM stdin;
1	0	600	f	3	0	t	t	t	1000	0	0	0	2025-07-26 05:12:51.073902	2025-07-26 22:35:10.783374
\.


--
-- TOC entry 3628 (class 0 OID 17154)
-- Dependencies: 240
-- Data for Name: reputation_log; Type: TABLE DATA; Schema: public; Owner: chiwawa
--

COPY public.reputation_log (id, user_id, change_amount, reason, details, admin_id, created_at) FROM stdin;
\.


--
-- TOC entry 3621 (class 0 OID 17039)
-- Dependencies: 233
-- Data for Name: server_rules; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.server_rules (id, title, content, category, order_index, is_active, created_at, updated_at) FROM stdin;
1	Уважение к игрокам	Будьте вежливы и дружелюбны. Оскорбления и токсичность недопустимы.	behavior	1	t	2025-07-26 05:12:51.073902	2025-07-26 05:12:51.073902
2	Запрет на гриферство	Не разрушайте чужие постройки без разрешения. Уважайте труд других игроков.	gameplay	2	t	2025-07-26 05:12:51.073902	2025-07-26 05:12:51.073902
3	Честная игра	Использование читов, дюпов и эксплойтов запрещено. Играйте честно.	gameplay	3	t	2025-07-26 05:12:51.073902	2025-07-26 05:12:51.073902
4	Активность в сообществе	Участвуйте в жизни сервера, общайтесь в Discord, помогайте новичкам.	community	4	t	2025-07-26 05:12:51.073902	2025-07-26 05:12:51.073902
5	Возрастные ограничения	Сервер предназначен для игроков от 16 лет. Исключения только с разрешения администрации.	general	5	t	2025-07-26 05:12:51.073902	2025-07-26 05:12:51.073902
\.


--
-- TOC entry 3630 (class 0 OID 17180)
-- Dependencies: 242
-- Data for Name: server_settings; Type: TABLE DATA; Schema: public; Owner: chiwawa
--

COPY public.server_settings (id, setting_key, setting_value, updated_at, updated_by) FROM stdin;
1	server_name	"ChiwawaMine"	2025-07-26 14:38:46.533872	1
\.


--
-- TOC entry 3619 (class 0 OID 17026)
-- Dependencies: 231
-- Data for Name: server_status; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.server_status (id, is_online, online_players, max_players, server_version, motd, updated_at) FROM stdin;
1	f	0	20	1.20.4	Добро пожаловать на Chiwawa Server!	2025-07-26 05:12:51.073902
\.


--
-- TOC entry 3622 (class 0 OID 17052)
-- Dependencies: 234
-- Data for Name: site_settings; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.site_settings (key, value, description, category, updated_by, updated_at) FROM stdin;
server_name	Chiwawa Server	Название сервера	general	\N	2025-07-26 05:12:51.073902
server_description	Приватный Minecraft сервер для своих.<br><span class="text-chiwawa-primary font-semibold">Вход только по заявку.</span>	Описание сервера	general	\N	2025-07-26 05:12:51.073902
discord_invite	https://discord.gg/your-invite	Ссылка на Discord сервер	social	\N	2025-07-26 05:12:51.073902
color_scheme	orange	Цветовая схема сайта	appearance	\N	2025-07-26 05:12:51.073902
registration_enabled	true	Разрешена ли подача заявок	registration	\N	2025-07-26 05:12:51.073902
max_applications_per_day	10	Максимум заявок в день с одного IP	registration	\N	2025-07-26 05:12:51.073902
email_notifications	true	Включены ли email уведомления	notifications	\N	2025-07-26 05:12:51.073902
trust_level_system	true	Включена ли система Trust Level	gameplay	\N	2025-07-26 05:12:51.073902
time_limit_for_newcomers	600	Лимит времени для новичков в минутах	gameplay	\N	2025-07-26 05:12:51.073902
smtp_host	smtp.yandex.ru	SMTP сервер для отправки email	email	\N	2025-07-26 05:12:51.073902
smtp_port	465	Порт SMTP сервера	email	\N	2025-07-26 05:12:51.073902
smtp_user	chiwawa.helper@yandex.ru	Пользователь SMTP	email	\N	2025-07-26 05:12:51.073902
maintenance_mode	false	Режим технических работ	system	\N	2025-07-26 05:12:51.073902
\.


--
-- TOC entry 3624 (class 0 OID 17102)
-- Dependencies: 236
-- Data for Name: trust_level_applications; Type: TABLE DATA; Schema: public; Owner: chiwawa
--

COPY public.trust_level_applications (id, user_id, current_level, requested_level, reason, status, hours_played, reputation_score, email_verified, reviewed_by, reviewed_at, review_comment, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 3617 (class 0 OID 17006)
-- Dependencies: 229
-- Data for Name: user_achievements; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.user_achievements (id, user_id, achievement_id, earned_at) FROM stdin;
\.


--
-- TOC entry 3611 (class 0 OID 16958)
-- Dependencies: 223
-- Data for Name: user_activity; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.user_activity (id, user_id, activity_type, description, metadata, ip_address, created_at) FROM stdin;
1	1	login	Вход в систему	\N	::1	2025-07-26 06:04:15.154537
2	1	login	Вход в систему	\N	::1	2025-07-26 16:17:54.568696
3	1	login	Вход в систему	\N	::1	2025-07-26 20:35:13.141596
4	2	login	Вход в систему	\N	::1	2025-07-26 23:20:41.017165
\.


--
-- TOC entry 3626 (class 0 OID 17128)
-- Dependencies: 238
-- Data for Name: user_reputation; Type: TABLE DATA; Schema: public; Owner: chiwawa
--

COPY public.user_reputation (id, user_id, reputation_score, positive_votes, negative_votes, forum_posts, helpful_posts, reported_bugs, community_contributions, warnings_received, temporary_bans, reputation_penalties, created_at, updated_at) FROM stdin;
1	1	0	0	0	0	0	0	0	0	0	0	2025-07-26 14:18:35.849501	2025-07-26 14:18:35.849501
\.


--
-- TOC entry 3605 (class 0 OID 16913)
-- Dependencies: 217
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.user_sessions (id, user_id, token_hash, expires_at, ip_address, user_agent, is_active, created_at) FROM stdin;
413ed831-833e-481d-bad1-c125107f0989	1	ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qRXNJbVZ0WVdsc0lqb2laR2x0WVRKZk1EVkFiV0ZwYkM1eWRTSXNJbkp2YkdVaU9pSmhaRzFwYmlJc0ltbGhkQ0k2TVRjMU16VXdPVGcxTkN3aVpYaHdJam94TnpVMk1UQXhPRFUwZlEuQmdfdUtObEFtc3ktak93M1hCVHFnaThzSzFuVVlBUUJTYlFhNnQ0WkVDaw==	2025-08-25 09:04:14.253	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36	t	2025-07-26 06:04:14.833344
a71000eb-fa83-424c-87b3-53ea1b0c8f5d	1	ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qRXNJbVZ0WVdsc0lqb2laR2x0WVRKZk1EVkFiV0ZwYkM1eWRTSXNJbkp2YkdVaU9pSmhaRzFwYmlJc0ltbGhkQ0k2TVRjMU16VTBOalkzTXl3aVpYaHdJam94TnpVMk1UTTROamN6ZlEuVVYzbDFOcGdsY3hhSjAxVXdUNERIdEprN0hrcF9TSENwdktpek95Y2FtMA==	2025-08-25 19:17:53.999	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36	t	2025-07-26 16:17:54.509684
e2cdbc47-c757-4773-be9c-c75a5e05193b	1	ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qRXNJbVZ0WVdsc0lqb2laR2x0WVRKZk1EVkFiV0ZwYkM1eWRTSXNJbkp2YkdVaU9pSmhaRzFwYmlJc0ltbGhkQ0k2TVRjMU16VTJNakV4TWl3aVpYaHdJam94TnpVMk1UVTBNVEV5ZlEucWhxRkdfYVpVZzl5TUVnSkhJemplRXNhSE4xaXFfMTJyZ2tuUVc4YzVZOA==	2025-08-25 23:35:12.283	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36	t	2025-07-26 20:35:12.819451
685fb0d7-e5d7-4e81-b575-3d925fcce49b	2	ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5U1dRaU9qSXNJbVZ0WVdsc0lqb2ljMmhoWkc5M1oyRnRaWE5pYkdGamEzUjFZbVZBWjIxaGFXd3VZMjl0SWl3aWNtOXNaU0k2SW5WelpYSWlMQ0pwWVhRaU9qRTNOVE0xTnpJd05EQXNJbVY0Y0NJNk1UYzFNelkxT0RRME1IMC5JcXJxWjlKNUc1RV84dmFqaWdKTnd6Y2h5MXVqaUt6MkN3VzRlRWN0M184	2025-07-28 02:20:40.177	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.0.0 Safari/537.36	t	2025-07-26 23:20:40.692808
\.


--
-- TOC entry 3599 (class 0 OID 16829)
-- Dependencies: 211
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: root
--

COPY public.users (id, nickname, email, password_hash, first_name, last_name, age, display_name, bio, avatar_url, discord_id, discord_tag, role, trust_level, status, is_active, is_email_verified, is_banned, registered_at, last_login, ban_reason) FROM stdin;
1	ebluffy	dima2_05@mail.ru	$2a$12$Wp8pSrr9R1tPyaT7BUW4RuIT2Kdt1YdEWdsrL.J3vvSs6p/am39o2	Дмитрий	\N	\N	Администратор	\N	\N	\N	\N	admin	3	active	t	t	f	2025-07-26 05:12:51.073902	2025-07-26 20:35:12.926927	\N
2	KORESHon	shadowgamesblacktube@gmail.com	$2a$12$Wp8pSrr9R1tPyaT7BUW4RuIT2Kdt1YdEWdsrL.J3vvSs6p/am39o2	Дмитрий	\N	\N	\N	\N	\N	\N	\N	moderator	1	active	t	f	f	2025-07-26 05:12:51.073902	2025-07-26 23:20:40.803231	\N
\.


--
-- TOC entry 3653 (class 0 OID 0)
-- Dependencies: 226
-- Name: achievements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.achievements_id_seq', 8, true);


--
-- TOC entry 3654 (class 0 OID 0)
-- Dependencies: 224
-- Name: admin_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.admin_logs_id_seq', 13, true);


--
-- TOC entry 3655 (class 0 OID 0)
-- Dependencies: 212
-- Name: applications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.applications_id_seq', 1, false);


--
-- TOC entry 3656 (class 0 OID 0)
-- Dependencies: 220
-- Name: discord_oauth_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.discord_oauth_id_seq', 1, false);


--
-- TOC entry 3657 (class 0 OID 0)
-- Dependencies: 218
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.email_verification_tokens_id_seq', 1, false);


--
-- TOC entry 3658 (class 0 OID 0)
-- Dependencies: 215
-- Name: login_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.login_logs_id_seq', 4, true);


--
-- TOC entry 3659 (class 0 OID 0)
-- Dependencies: 239
-- Name: reputation_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.reputation_log_id_seq', 1, false);


--
-- TOC entry 3660 (class 0 OID 0)
-- Dependencies: 232
-- Name: server_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.server_rules_id_seq', 5, true);


--
-- TOC entry 3661 (class 0 OID 0)
-- Dependencies: 241
-- Name: server_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.server_settings_id_seq', 2, true);


--
-- TOC entry 3662 (class 0 OID 0)
-- Dependencies: 230
-- Name: server_status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.server_status_id_seq', 1, true);


--
-- TOC entry 3663 (class 0 OID 0)
-- Dependencies: 235
-- Name: trust_level_applications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.trust_level_applications_id_seq', 1, false);


--
-- TOC entry 3664 (class 0 OID 0)
-- Dependencies: 228
-- Name: user_achievements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.user_achievements_id_seq', 1, false);


--
-- TOC entry 3665 (class 0 OID 0)
-- Dependencies: 222
-- Name: user_activity_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.user_activity_id_seq', 4, true);


--
-- TOC entry 3666 (class 0 OID 0)
-- Dependencies: 237
-- Name: user_reputation_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chiwawa
--

SELECT pg_catalog.setval('public.user_reputation_id_seq', 1, true);


--
-- TOC entry 3667 (class 0 OID 0)
-- Dependencies: 210
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: root
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- TOC entry 3408 (class 2606 OID 17004)
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- TOC entry 3403 (class 2606 OID 16981)
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 3370 (class 2606 OID 16862)
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- TOC entry 3396 (class 2606 OID 16951)
-- Name: discord_oauth discord_oauth_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.discord_oauth
    ADD CONSTRAINT discord_oauth_pkey PRIMARY KEY (id);


--
-- TOC entry 3389 (class 2606 OID 16936)
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 3391 (class 2606 OID 16938)
-- Name: email_verification_tokens email_verification_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_key UNIQUE (token);


--
-- TOC entry 3382 (class 2606 OID 16907)
-- Name: login_logs login_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 3377 (class 2606 OID 16891)
-- Name: player_stats player_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.player_stats
    ADD CONSTRAINT player_stats_pkey PRIMARY KEY (user_id);


--
-- TOC entry 3432 (class 2606 OID 17162)
-- Name: reputation_log reputation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.reputation_log
    ADD CONSTRAINT reputation_log_pkey PRIMARY KEY (id);


--
-- TOC entry 3418 (class 2606 OID 17051)
-- Name: server_rules server_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.server_rules
    ADD CONSTRAINT server_rules_pkey PRIMARY KEY (id);


--
-- TOC entry 3434 (class 2606 OID 17188)
-- Name: server_settings server_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.server_settings
    ADD CONSTRAINT server_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 3436 (class 2606 OID 17190)
-- Name: server_settings server_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.server_settings
    ADD CONSTRAINT server_settings_setting_key_key UNIQUE (setting_key);


--
-- TOC entry 3416 (class 2606 OID 17037)
-- Name: server_status server_status_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.server_status
    ADD CONSTRAINT server_status_pkey PRIMARY KEY (id);


--
-- TOC entry 3420 (class 2606 OID 17060)
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (key);


--
-- TOC entry 3424 (class 2606 OID 17116)
-- Name: trust_level_applications trust_level_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.trust_level_applications
    ADD CONSTRAINT trust_level_applications_pkey PRIMARY KEY (id);


--
-- TOC entry 3412 (class 2606 OID 17012)
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- TOC entry 3414 (class 2606 OID 17014)
-- Name: user_achievements user_achievements_user_id_achievement_id_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_achievement_id_key UNIQUE (user_id, achievement_id);


--
-- TOC entry 3401 (class 2606 OID 16966)
-- Name: user_activity user_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_pkey PRIMARY KEY (id);


--
-- TOC entry 3427 (class 2606 OID 17145)
-- Name: user_reputation user_reputation_pkey; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.user_reputation
    ADD CONSTRAINT user_reputation_pkey PRIMARY KEY (id);


--
-- TOC entry 3429 (class 2606 OID 17147)
-- Name: user_reputation user_reputation_user_id_key; Type: CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.user_reputation
    ADD CONSTRAINT user_reputation_user_id_key UNIQUE (user_id);


--
-- TOC entry 3387 (class 2606 OID 16922)
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 3364 (class 2606 OID 16850)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 3366 (class 2606 OID 16848)
-- Name: users users_nickname_key; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_nickname_key UNIQUE (nickname);


--
-- TOC entry 3368 (class 2606 OID 16846)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3404 (class 1259 OID 17090)
-- Name: idx_admin_logs_admin_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_admin_logs_admin_id ON public.admin_logs USING btree (admin_id);


--
-- TOC entry 3405 (class 1259 OID 17092)
-- Name: idx_admin_logs_created_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_admin_logs_created_at ON public.admin_logs USING btree (created_at);


--
-- TOC entry 3406 (class 1259 OID 17091)
-- Name: idx_admin_logs_target_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_admin_logs_target_user_id ON public.admin_logs USING btree (target_user_id);


--
-- TOC entry 3371 (class 1259 OID 17073)
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_applications_status ON public.applications USING btree (status);


--
-- TOC entry 3372 (class 1259 OID 17074)
-- Name: idx_applications_submitted_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_applications_submitted_at ON public.applications USING btree (submitted_at);


--
-- TOC entry 3373 (class 1259 OID 17075)
-- Name: idx_applications_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_applications_user_id ON public.applications USING btree (user_id);


--
-- TOC entry 3392 (class 1259 OID 17086)
-- Name: idx_email_verification_tokens_expires_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_email_verification_tokens_expires_at ON public.email_verification_tokens USING btree (expires_at);


--
-- TOC entry 3393 (class 1259 OID 17085)
-- Name: idx_email_verification_tokens_token; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_email_verification_tokens_token ON public.email_verification_tokens USING btree (token);


--
-- TOC entry 3394 (class 1259 OID 17084)
-- Name: idx_email_verification_tokens_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_email_verification_tokens_user_id ON public.email_verification_tokens USING btree (user_id);


--
-- TOC entry 3378 (class 1259 OID 17080)
-- Name: idx_login_logs_ip_address; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_login_logs_ip_address ON public.login_logs USING btree (ip_address);


--
-- TOC entry 3379 (class 1259 OID 17079)
-- Name: idx_login_logs_login_time; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_login_logs_login_time ON public.login_logs USING btree (login_time);


--
-- TOC entry 3380 (class 1259 OID 17078)
-- Name: idx_login_logs_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_login_logs_user_id ON public.login_logs USING btree (user_id);


--
-- TOC entry 3374 (class 1259 OID 17077)
-- Name: idx_player_stats_current_level; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_player_stats_current_level ON public.player_stats USING btree (current_level);


--
-- TOC entry 3375 (class 1259 OID 17076)
-- Name: idx_player_stats_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_player_stats_user_id ON public.player_stats USING btree (user_id);


--
-- TOC entry 3430 (class 1259 OID 17178)
-- Name: idx_reputation_log_user_id; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_reputation_log_user_id ON public.reputation_log USING btree (user_id);


--
-- TOC entry 3421 (class 1259 OID 17176)
-- Name: idx_trust_level_applications_status; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_trust_level_applications_status ON public.trust_level_applications USING btree (status);


--
-- TOC entry 3422 (class 1259 OID 17175)
-- Name: idx_trust_level_applications_user_id; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_trust_level_applications_user_id ON public.trust_level_applications USING btree (user_id);


--
-- TOC entry 3409 (class 1259 OID 17094)
-- Name: idx_user_achievements_achievement_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_achievements_achievement_id ON public.user_achievements USING btree (achievement_id);


--
-- TOC entry 3410 (class 1259 OID 17093)
-- Name: idx_user_achievements_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_achievements_user_id ON public.user_achievements USING btree (user_id);


--
-- TOC entry 3397 (class 1259 OID 17088)
-- Name: idx_user_activity_created_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_activity_created_at ON public.user_activity USING btree (created_at);


--
-- TOC entry 3398 (class 1259 OID 17089)
-- Name: idx_user_activity_type; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_activity_type ON public.user_activity USING btree (activity_type);


--
-- TOC entry 3399 (class 1259 OID 17087)
-- Name: idx_user_activity_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_activity_user_id ON public.user_activity USING btree (user_id);


--
-- TOC entry 3425 (class 1259 OID 17177)
-- Name: idx_user_reputation_user_id; Type: INDEX; Schema: public; Owner: chiwawa
--

CREATE INDEX idx_user_reputation_user_id ON public.user_reputation USING btree (user_id);


--
-- TOC entry 3383 (class 1259 OID 17083)
-- Name: idx_user_sessions_expires_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions USING btree (expires_at);


--
-- TOC entry 3384 (class 1259 OID 17100)
-- Name: idx_user_sessions_token_hash; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_sessions_token_hash ON public.user_sessions USING btree (token_hash);


--
-- TOC entry 3385 (class 1259 OID 17081)
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- TOC entry 3356 (class 1259 OID 17072)
-- Name: idx_users_discord_id; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_discord_id ON public.users USING btree (discord_id);


--
-- TOC entry 3357 (class 1259 OID 17066)
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- TOC entry 3358 (class 1259 OID 17067)
-- Name: idx_users_nickname; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_nickname ON public.users USING btree (nickname);


--
-- TOC entry 3359 (class 1259 OID 17071)
-- Name: idx_users_registered_at; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_registered_at ON public.users USING btree (registered_at);


--
-- TOC entry 3360 (class 1259 OID 17068)
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- TOC entry 3361 (class 1259 OID 17070)
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- TOC entry 3362 (class 1259 OID 17069)
-- Name: idx_users_trust_level; Type: INDEX; Schema: public; Owner: root
--

CREATE INDEX idx_users_trust_level ON public.users USING btree (trust_level);


--
-- TOC entry 3456 (class 2620 OID 17097)
-- Name: player_stats update_player_stats_updated_at; Type: TRIGGER; Schema: public; Owner: root
--

CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON public.player_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3458 (class 2620 OID 17096)
-- Name: server_rules update_server_rules_updated_at; Type: TRIGGER; Schema: public; Owner: root
--

CREATE TRIGGER update_server_rules_updated_at BEFORE UPDATE ON public.server_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3457 (class 2620 OID 17098)
-- Name: server_status update_server_status_updated_at; Type: TRIGGER; Schema: public; Owner: root
--

CREATE TRIGGER update_server_status_updated_at BEFORE UPDATE ON public.server_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3445 (class 2606 OID 16982)
-- Name: admin_logs admin_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 3446 (class 2606 OID 16987)
-- Name: admin_logs admin_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 3438 (class 2606 OID 16868)
-- Name: applications applications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- TOC entry 3437 (class 2606 OID 16863)
-- Name: applications applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3443 (class 2606 OID 16952)
-- Name: discord_oauth discord_oauth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.discord_oauth
    ADD CONSTRAINT discord_oauth_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3442 (class 2606 OID 16939)
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3440 (class 2606 OID 16908)
-- Name: login_logs login_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3439 (class 2606 OID 16892)
-- Name: player_stats player_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.player_stats
    ADD CONSTRAINT player_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3454 (class 2606 OID 17168)
-- Name: reputation_log reputation_log_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.reputation_log
    ADD CONSTRAINT reputation_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- TOC entry 3453 (class 2606 OID 17163)
-- Name: reputation_log reputation_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.reputation_log
    ADD CONSTRAINT reputation_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3455 (class 2606 OID 17191)
-- Name: server_settings server_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.server_settings
    ADD CONSTRAINT server_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 3449 (class 2606 OID 17061)
-- Name: site_settings site_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 3451 (class 2606 OID 17122)
-- Name: trust_level_applications trust_level_applications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.trust_level_applications
    ADD CONSTRAINT trust_level_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- TOC entry 3450 (class 2606 OID 17117)
-- Name: trust_level_applications trust_level_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.trust_level_applications
    ADD CONSTRAINT trust_level_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3448 (class 2606 OID 17020)
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;


--
-- TOC entry 3447 (class 2606 OID 17015)
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3444 (class 2606 OID 16967)
-- Name: user_activity user_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3452 (class 2606 OID 17148)
-- Name: user_reputation user_reputation_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chiwawa
--

ALTER TABLE ONLY public.user_reputation
    ADD CONSTRAINT user_reputation_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3441 (class 2606 OID 16923)
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: root
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Completed on 2025-07-26 23:37:18 UTC

--
-- PostgreSQL database dump complete
--

