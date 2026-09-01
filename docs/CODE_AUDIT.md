# Web Master — live code audit

Этот документ ведётся параллельно с разработкой. Статусы обновляются по мере исправлений.

## Исправлено

- [x] Wizard расширен до шага «Настройка приложения» между проверкой кода и размещением.
- [x] Конструктор полей: тип, required, userOwned, AI access.
- [x] Автообнаружение input/select/textarea/localStorage вынесено в отдельное чистое ядро.
- [x] Связи сущностей 1:1 / 1:N / N:M.
- [x] Роли Owner/Admin/User/Viewer и матрица permissions.
- [x] Owner всегда имеет полный доступ.
- [x] Серверная policy-проверка прав перед CRUD.
- [x] Runtime principal: роль обычного пользователя берётся из app_members, а не из параметров клиента.
- [x] app_records: server-side list/get/create/update/soft-delete repository.
- [x] app_record_links: server-side link/unlink с проверкой сущностей и cardinality.
- [x] Audit log для mutations.
- [x] AI secret-like fields не допускаются к read/write.
- [x] AI bridge больше не должен использовать postMessage wildcard; target origin должен быть доверенным.
- [x] Supabase browser env fallback защищён от ReferenceError при отсутствии process в браузере.
- [x] Dataset row mapping переводится с any на unknown/typed mapping.
- [x] Deployment public runtime: trailing-slash SPA route корректно возвращает root entry.
- [x] Deployment public runtime блокирует backslash, percent-encoded и control-char paths.
- [x] readPublishedAsset логирует ошибки чтения project/version/Storage вместо молчаливого 404 при инфраструктурной ошибке.
- [x] REG.RU architecture использует deployment-agent + server secrets; пароль кабинета не хранится.
- [x] .env исключён из GitHub.

## Параметры, сверенные между control plane и deploy-agent

- max ZIP: 50 MiB.
- max extracted: 250 MiB.
- max files: 2000.
- max single file: 100 MiB.
- agent token: минимум 32 символа.
- REG.RU client timeout: 3–60 секунд, default 15 секунд.
- public deployment agent работает только через HTTPS в production.
- localhost/http допускается только явным dev-флагом.
- immutable releases не перезаписываются.
- activation и rollback должны сохранять предыдущий рабочий release до подтверждения нового.

## Требует интеграционного теста

- [ ] Реальный Supabase migration для app_runtime_configs/app_members/app_records/app_record_links/app_audit_log/app_daily_metrics.
- [ ] RLS/grants в развернутой БД.
- [ ] CRUD app_records через реальные server functions + Supabase service role.
- [ ] Реальный внешний identity provider / Supabase Auth для app_members.external_auth_id.
- [ ] Concurrent update/soft-delete одного app_record.
- [ ] Concurrent 1:1 и 1:N relation creation.
- [ ] Admin dashboard на реальных метриках.
- [ ] AI event ingestion от sandbox-приложения через viewer с origin validation.
- [ ] REG.RU agent на тестовом VPS: prepare → activate → health → rollback.
- [ ] Фактический build/test полного проекта после установки node_modules.

## Следующая очередь разработки

1. Server functions для runtime CRUD и members.
2. Invitations + authenticated member resolution.
3. Admin routes: dashboard / users / records / roles / audit / AI.
4. Metrics aggregation.
5. Full dependency install, typecheck, tests, build, lint.
6. Интеграционные тесты Supabase/Storage и тестовый REG.RU VPS.
