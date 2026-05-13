use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use tauri::Manager;

/// Initializes the SQLite database in the app data directory and runs all pending migrations.
pub async fn init_db(app: &tauri::AppHandle) -> Result<SqlitePool, anyhow::Error> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Could not resolve app data dir: {e}"))?;

    std::fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("octave.db");
    let db_url = format!("sqlite:{}", db_path.display());

    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run migrations from the embedded migrations directory
    sqlx::migrate!("./migrations").run(&pool).await?;

    log::info!("Database initialized at {}", db_path.display());

    Ok(pool)
}
