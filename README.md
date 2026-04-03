# feriados-producer

Servicio responsable de obtener, normalizar, auditar y publicar snapshots de feriados nacionales del Peru a partir de `https://www.gob.pe/feriados`.

## Que hace

- ejecuta scraping cada 12 horas en `America/Lima`
- usa `fetch` con retries, timeout y headers realistas
- detecta respuestas bloqueadas por WAF
- usa Playwright como fallback cuando el fetch normal no basta
- parsea y normaliza el HTML actual de `gob.pe`, incluyendo el bloque ancla y la tabla de próximos feriados
- detecta cambios por `normalized_hash` sobre lo observado en la fuente
- reconcilia la observación parcial con un baseline semilla antes de actualizar la proyección actual
- rechaza promociones sospechosas cuando la fuente parece parcial o cambió de estructura
- guarda auditoria de corridas, snapshots históricos, eventos de scraping y tabla actual en PostgreSQL
- reconstruye Redis después de una actualización válida
- limpia corridas y snapshots antiguos según la política de retención

## Flujo operativo

1. descarga `gob.pe/feriados`
2. valida si hubo bloqueo o HTML inconsistente
3. cae a navegador si hace falta
4. parsea feriados observados desde el bloque ancla y la tabla de próximos
5. calcula hashes del HTML y del payload observado
6. compara contra el snapshot observado actual
7. reconcilia observación + baseline anual
8. si la promoción es válida, escribe PostgreSQL y luego refresca Redis
9. si la promoción es rechazada, mantiene la proyección actual y registra el motivo
8. registra la corrida en `scrape_runs`
9. ejecuta cleanup de retención

## Fuente de verdad y caché

- PostgreSQL es la fuente de verdad
- Redis es cache reconstruible
- el productor escribe PG primero y Redis después
- si Redis falla, la corrida queda registrada igual y el API puede seguir leyendo desde PG

## Tablas que mantiene

- `scrape_runs`: auditoria de cada ejecución
- `scrape_run_events`: eventos estructurados de reconciliación y rechazo/promoción
- `holiday_snapshots`: snapshot observado del scrape
- `holiday_snapshot_items`: detalle observado por feriado dentro de cada snapshot
- `holiday_baselines`: semilla anual de respaldo para años soportados
- `holidays_current`: proyección reconciliada y optimizada para lectura
- `schema_migrations`: control de migraciones aplicadas

## Variables de entorno

Tomadas de [`.env.example`](.env.example):

- `PRODUCER_CRON`: cron del productor. Default `0 0 */12 * * *`
- `TIMEZONE`: default `America/Lima`
- `HOLIDAYS_SOURCE_URL`: origen del scraping
- `HTTP_TIMEOUT_MS`: timeout HTTP
- `HTTP_MAX_RETRIES`: retries del fetch base
- `USE_PLAYWRIGHT_FALLBACK`: habilita fallback de navegador
- `SNAPSHOT_RETENTION_DAYS`: retención de snapshots no vigentes
- `SCRAPE_RUN_RETENTION_DAYS`: retención de corridas históricas
- `QUERY_TRACE_RETENTION_DAYS`: retención de trazas de consulta del API
- `REDIS_CACHE_TTL_SECONDS`: TTL de las claves Redis del snapshot actual
- `MAX_ALLOWED_MISSING_FUTURE_HOLIDAYS`: umbral absoluto de futuros faltantes aceptables antes de rechazar promoción
- `MIN_OBSERVED_COVERAGE_RATIO`: cobertura mínima observada contra el baseline restante
- `DATABASE_URL`: PostgreSQL
- `REDIS_URL`: Redis
- `PARSER_VERSION`: version del parser para auditoria

## Comandos útiles

```bash
npm run build
npm test
npm run migrate
npm run once
npm run cleanup
npm start
```

Que hace cada uno:

- `npm run migrate`: aplica migraciones SQL pendientes
- `npm run once`: ejecuta una corrida manual completa
- `npm run cleanup`: ejecuta solo la limpieza de retención
- `npm start`: arranca el proceso cron compilado

Con `pm2`:

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
```

## Salida esperada de una corrida manual

`npm run once` imprime un resumen como este:

```json
{
  "ok": true,
  "usedBrowserFallback": false,
  "statusCode": 200,
  "holidayCount": 15,
  "sync": {
    "changed": false,
    "persisted": false,
    "cleanup": {
      "deletedRuns": 0,
      "deletedSnapshots": 0
    }
  }
}
```

Campos relevantes:

- `changed`: indica si el payload canónico cambio frente al snapshot actual
- `persisted`: indica si se escribió un nuevo snapshot
- `usedBrowserFallback`: indica si fue necesario usar Playwright
- `holidayCount`: cantidad observada en la fuente, no necesariamente la proyección final servida por el API
- `cleanup`: resume la limpieza aplicada al final de la corrida

## Robustez actual

- lock en PG para evitar ejecuciones concurrentes
- fallback a navegador ante `403/418` o HTML bloqueado
- baseline 2026 para no perder feriados pasados cuando `gob.pe` solo muestra presente y futuros
- reconciliación que acepta desapariciones puntuales futuras, pero rechaza snapshots demasiado parciales
- logging estructurado con Pino
- audit trail también para scrapes fallidos
- shutdown limpio ante `SIGTERM` y `SIGINT`
- persistencia auditable de HTML crudo y payload normalizado
- refresh de Redis via pipeline
- TTL en cache Redis para evitar stale infinito si el productor deja de correr
- cleanup forward-only, sin rollback SQL automático

## Testing

- unitarios:
  - parser
  - hash
  - sync con doubles
  - cleanup
- funcionales:
  - HTML bloqueado
  - fallback a navegador
  - fixture realista de `gob.pe`

## Estado actual

MVP operativo y validado contra `gob.pe`, PostgreSQL y Redis reales.
