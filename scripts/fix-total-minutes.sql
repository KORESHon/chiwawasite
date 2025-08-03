-- Создание тригger для синхронизации total_minutes
CREATE OR REPLACE FUNCTION sync_user_total_minutes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users 
    SET total_minutes = NEW.time_played_minutes
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_user_total_minutes ON player_stats;
CREATE TRIGGER trigger_sync_user_total_minutes
    AFTER UPDATE OF time_played_minutes ON player_stats
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_total_minutes();
