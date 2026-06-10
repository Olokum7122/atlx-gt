export function buildOpenApiSpec({ port, apiBasePath }) {
  const basePath = apiBasePath || "/api/v1";
  const surveyResponseProfileExample = {
    code: "LK5_SAT_CLIENTE",
    label: "Likert satisfaccion cliente",
    sectionType: "likert",
    inputType: "likert_5",
    profileType: "satisfaccion",
    config: {
      profileType: "satisfaccion",
      description: "Escala de satisfaccion 5 puntos",
      scalePoints: 5,
    },
    options: [
      { optionLabel: "Muy insatisfecho", optionValue: "1", optionOrder: 1, weight: 1 },
      { optionLabel: "Insatisfecho", optionValue: "2", optionOrder: 2, weight: 2 },
      { optionLabel: "Neutral", optionValue: "3", optionOrder: 3, weight: 3 },
      { optionLabel: "Satisfecho", optionValue: "4", optionOrder: 4, weight: 4 },
      { optionLabel: "Muy satisfecho", optionValue: "5", optionOrder: 5, weight: 5 },
    ],
  };

  const surveyResponseProfileSchema = {
    type: "object",
    properties: {
      code: { type: "string" },
      label: { type: "string" },
      sectionType: { type: "string" },
      inputType: { type: "string" },
      profileType: { type: "string" },
      config: { type: "object", additionalProperties: true },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            optionLabel: { type: "string" },
            optionValue: { type: "string" },
            optionOrder: { type: "integer" },
            weight: { type: "number" },
          },
          required: ["optionLabel"],
        },
      },
    },
    required: ["code", "label", "sectionType", "inputType"],
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "ATLX GT API",
      version: "0.1.0",
      description: "Documentacion operativa para probar endpoints de GT API.",
    },
    servers: [
      {
        url: "https://gt-api.antojadosmx.mx",
        description: "Produccion (Cloudflare HTTPS)",
      },
      {
        url: `http://localhost:${port}`,
        description: "Local",
      },
    ],
    tags: [
      { name: "health", description: "Estado del servicio" },
      { name: "sync", description: "Sincronizacion y dispositivos" },
      { name: "config/dimensions", description: "Dimensiones" },
      { name: "config/locations", description: "Ubicaciones" },
      { name: "config/catalogs", description: "Catalogos" },
      { name: "config/components", description: "Componentes" },
      { name: "config/categories", description: "Categorias" },
      { name: "config/classifications", description: "Clasificaciones" },
      { name: "config/access", description: "Asignaciones de acceso" },
      { name: "config/users", description: "Usuarios" },
      { name: "config/roles", description: "Roles y permisos" },
      { name: "config/security", description: "Control de seguridad" },
      { name: "analytics/survey-profiles", description: "Perfiles de respuesta" },
      { name: "analytics/survey-docs", description: "Documentos de encuesta" },
      { name: "analytics/survey-reception", description: "Recepcion de encuestas" },
      { name: "collector", description: "Instalador del colector" },
      { name: "survey-public", description: "Encuestas publicas (web)" },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["health"],
          summary: "Health check",
          responses: { "200": { description: "Servicio disponible" } },
        },
      },

      // ── Sync ──────────────────────────────────────────────────────────────
      "/api/sync/flash": {
        post: {
          tags: ["sync"],
          summary: "Recibe envelope de sync (ruta compat)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sourceApp: { type: "string" },
                    tenantCode: { type: "string" },
                    deviceId: { type: "string" },
                    sentAt: { type: "string" },
                    eventBatch: { type: "array", items: { type: "object", additionalProperties: true } },
                  },
                  required: ["sourceApp", "tenantCode", "deviceId", "sentAt", "eventBatch"],
                },
              },
            },
          },
          responses: {
            "202": { description: "Envelope aceptado" },
            "400": { description: "Payload invalido" },
          },
        },
      },
      [`${basePath}/sync/flash`]: {
        post: {
          tags: ["sync"],
          summary: "Recibe envelope de sync",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sourceApp: { type: "string" },
                    tenantCode: { type: "string" },
                    deviceId: { type: "string" },
                    sentAt: { type: "string" },
                    eventBatch: { type: "array", items: { type: "object", additionalProperties: true } },
                  },
                  required: ["sourceApp", "tenantCode", "deviceId", "sentAt", "eventBatch"],
                },
              },
            },
          },
          responses: {
            "202": { description: "Envelope aceptado" },
            "400": { description: "Payload invalido" },
          },
        },
      },
      [`${basePath}/sync/pull`]: {
        get: {
          tags: ["sync"],
          summary: "Pull de datos pendientes",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/sync/push`]: {
        post: {
          tags: ["sync"],
          summary: "Push de datos al servidor",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/sync/device-activation/request`]: {
        post: {
          tags: ["sync"],
          summary: "Solicitar activacion de dispositivo",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/sync/device-activation/status`]: {
        get: {
          tags: ["sync"],
          summary: "Estado de activacion de dispositivo",
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Dimensions ────────────────────────────────────────────────
      [`${basePath}/config/dimensions`]: {
        get: {
          tags: ["config/dimensions"],
          summary: "Listar dimensiones",
          responses: { "200": { description: "OK" } },
        },
        patch: {
          tags: ["config/dimensions"],
          summary: "Actualizar dimension",
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["config/dimensions"],
          summary: "Eliminar dimension",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/dimensions/approve`]: {
        post: {
          tags: ["config/dimensions"],
          summary: "Aprobar dimension",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/dimensions/purge`]: {
        delete: {
          tags: ["config/dimensions"],
          summary: "Purgar dimensiones",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/dimensions/activate`]: {
        post: {
          tags: ["config/dimensions"],
          summary: "Activar dimension",
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Antojados: Dimensions (GT mirror) ───────────────────────────────
      [`${basePath}/antojados/gt/dimensions`]: {
        get: {
          tags: ["config/dimensions"],
          summary: "Listar dimensions de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/sub-dimensions`]: {
        get: {
          tags: ["config/dimensions"],
          summary: "Listar sub-dimensions de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/dimensions/batch-approve`]: {
        post: {
          tags: ["config/dimensions"],
          summary: "Aprobar dimensions de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/sub-dimensions/batch-approve`]: {
        post: {
          tags: ["config/dimensions"],
          summary: "Aprobar sub-dimensions de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/dimensions/{code}/status`]: {
        patch: {
          tags: ["config/dimensions"],
          summary: "Actualizar estatus de dimension de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/sub-dimensions/{code}/status`]: {
        patch: {
          tags: ["config/dimensions"],
          summary: "Actualizar estatus de sub-dimension de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/dimensions/{code}`]: {
        delete: {
          tags: ["config/dimensions"],
          summary: "Eliminar dimension de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/sub-dimensions/{code}`]: {
        delete: {
          tags: ["config/dimensions"],
          summary: "Eliminar sub-dimension de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/scanner/snapshot`]: {
        post: {
          tags: ["config/dimensions"],
          summary: "Ejecutar scanner source->metadata de Antojados (solo snapshot)",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/antojados/gt/scanner/save`]: {
        post: {
          tags: ["config/dimensions"],
          summary: "Persistir seleccion aprobada del scanner de Antojados",
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Locations ─────────────────────────────────────────────────
      [`${basePath}/config/locations`]: {
        get: {
          tags: ["config/locations"],
          summary: "Listar ubicaciones",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/locations/{id}`]: {
        get: {
          tags: ["config/locations"],
          summary: "Detalle de ubicacion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["config/locations"],
          summary: "Eliminar ubicacion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/locations/save-aggregate`]: {
        post: {
          tags: ["config/locations"],
          summary: "Guardar ubicacion agregada",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/locations/{id}/cascade`]: {
        delete: {
          tags: ["config/locations"],
          summary: "Eliminar ubicacion en cascada",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/locations/{id}/rebuild-cascade`]: {
        post: {
          tags: ["config/locations"],
          summary: "Reconstruir cascada de ubicacion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/locations/{id}/cascade-components`]: {
        get: {
          tags: ["config/locations"],
          summary: "Componentes en cascada de ubicacion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/locations/{id}/cascade-visibility`]: {
        patch: {
          tags: ["config/locations"],
          summary: "Actualizar visibilidad en cascada",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Catalogs ──────────────────────────────────────────────────
      [`${basePath}/config/catalogs`]: {
        get: {
          tags: ["config/catalogs"],
          summary: "Listar catalogos",
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["config/catalogs"],
          summary: "Crear catalogo",
          responses: { "201": { description: "Created" } },
        },
      },
      [`${basePath}/config/catalogs/module-tabs`]: {
        get: {
          tags: ["config/catalogs"],
          summary: "Tabs de modulos de catalogos",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/catalogs/rules/checklist`]: {
        get: {
          tags: ["config/catalogs"],
          summary: "Checklist de reglas",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/catalogs/{id}`]: {
        get: {
          tags: ["config/catalogs"],
          summary: "Detalle de catalogo",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        put: {
          tags: ["config/catalogs"],
          summary: "Actualizar catalogo",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["config/catalogs"],
          summary: "Eliminar catalogo",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/catalogs/{id}/rules`]: {
        get: {
          tags: ["config/catalogs"],
          summary: "Reglas del catalogo",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/catalogs/{id}/rules/apply`]: {
        post: {
          tags: ["config/catalogs"],
          summary: "Aplicar reglas al catalogo",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Components ────────────────────────────────────────────────
      [`${basePath}/config/component-catalogs`]: {
        get: {
          tags: ["config/components"],
          summary: "Listar catalogos de componentes",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/component-catalogs/checklist`]: {
        get: {
          tags: ["config/components"],
          summary: "Checklist de componentes",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/component-catalogs/replace`]: {
        post: {
          tags: ["config/components"],
          summary: "Reemplazar componente",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/component-catalogs/{id}`]: {
        delete: {
          tags: ["config/components"],
          summary: "Eliminar catalogo de componente",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/component-catalogs/options/modules`]: {
        get: {
          tags: ["config/components"],
          summary: "Opciones: modulos",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/component-catalogs/options/areas`]: {
        get: {
          tags: ["config/components"],
          summary: "Opciones: areas",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/component-catalogs/options/components`]: {
        get: {
          tags: ["config/components"],
          summary: "Opciones: componentes",
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Categories ────────────────────────────────────────────────
      [`${basePath}/config/categories`]: {
        get: {
          tags: ["config/categories"],
          summary: "Listar categorias",
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["config/categories"],
          summary: "Crear categoria",
          responses: { "201": { description: "Created" } },
        },
      },
      [`${basePath}/config/categories/{id}`]: {
        put: {
          tags: ["config/categories"],
          summary: "Actualizar categoria",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["config/categories"],
          summary: "Eliminar categoria",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Classifications ───────────────────────────────────────────
      [`${basePath}/config/classifications`]: {
        get: {
          tags: ["config/classifications"],
          summary: "Listar clasificaciones",
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["config/classifications"],
          summary: "Crear clasificacion",
          responses: { "201": { description: "Created" } },
        },
      },
      [`${basePath}/config/classifications/{id}`]: {
        put: {
          tags: ["config/classifications"],
          summary: "Actualizar clasificacion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["config/classifications"],
          summary: "Eliminar clasificacion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Access Assignments ────────────────────────────────────────
      [`${basePath}/config/access-assignments`]: {
        get: {
          tags: ["config/access"],
          summary: "Listar asignaciones de acceso",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/access-assignments/{id}`]: {
        get: {
          tags: ["config/access"],
          summary: "Detalle de asignacion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["config/access"],
          summary: "Eliminar asignacion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/access-assignments/save`]: {
        post: {
          tags: ["config/access"],
          summary: "Guardar asignacion",
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Users ─────────────────────────────────────────────────────
      [`${basePath}/config/users`]: {
        get: {
          tags: ["config/users"],
          summary: "Listar usuarios",
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["config/users"],
          summary: "Crear usuario",
          responses: { "201": { description: "Created" } },
        },
      },
      [`${basePath}/config/users/{id}`]: {
        get: {
          tags: ["config/users"],
          summary: "Detalle de usuario",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        put: {
          tags: ["config/users"],
          summary: "Actualizar usuario",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["config/users"],
          summary: "Eliminar usuario",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/users/{id}/reset-password`]: {
        post: {
          tags: ["config/users"],
          summary: "Resetear contrasena de usuario",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Roles ─────────────────────────────────────────────────────
      [`${basePath}/config/roles`]: {
        get: {
          tags: ["config/roles"],
          summary: "Listar roles",
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["config/roles"],
          summary: "Crear rol",
          responses: { "201": { description: "Created" } },
        },
      },
      [`${basePath}/config/roles/permission-catalog`]: {
        get: {
          tags: ["config/roles"],
          summary: "Catalogo de permisos",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/roles/{id}`]: {
        get: {
          tags: ["config/roles"],
          summary: "Detalle de rol",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        put: {
          tags: ["config/roles"],
          summary: "Actualizar rol",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["config/roles"],
          summary: "Eliminar rol",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Config: Security ──────────────────────────────────────────────────
      [`${basePath}/config/security/control-login`]: {
        get: {
          tags: ["config/security"],
          summary: "Control de login",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/security/control-login/sessions/{id}/revoke`]: {
        post: {
          tags: ["config/security"],
          summary: "Revocar sesion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/security/password-resets`]: {
        get: {
          tags: ["config/security"],
          summary: "Listar resets de contrasena",
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["config/security"],
          summary: "Crear reset de contrasena",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/config/security/password-resets/{id}/revoke`]: {
        post: {
          tags: ["config/security"],
          summary: "Revocar reset de contrasena",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Analytics: Survey Response Profiles ───────────────────────────────
      [`${basePath}/analytics/survey-response-profiles`]: {
        get: {
          tags: ["analytics/survey-profiles"],
          summary: "Lista perfiles de respuesta",
          parameters: [
            { name: "include_inactive", in: "query", schema: { type: "string", enum: ["0", "1"] } },
            { name: "section_type", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["analytics/survey-profiles"],
          summary: "Crea perfil de respuesta",
          requestBody: {
            required: true,
            content: { "application/json": { schema: surveyResponseProfileSchema, example: surveyResponseProfileExample } },
          },
          responses: { "200": { description: "Perfil creado" }, "400": { description: "Payload invalido" } },
        },
      },
      [`${basePath}/analytics/survey-response-profiles/{id}`]: {
        get: {
          tags: ["analytics/survey-profiles"],
          summary: "Obtiene perfil por id",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "OK" }, "404": { description: "No encontrado" } },
        },
        put: {
          tags: ["analytics/survey-profiles"],
          summary: "Actualiza perfil por id",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: surveyResponseProfileSchema, example: surveyResponseProfileExample } },
          },
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["analytics/survey-profiles"],
          summary: "Desactiva perfil por id",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Analytics: Survey Docs ────────────────────────────────────────────
      [`${basePath}/analytics/survey-docs`]: {
        get: {
          tags: ["analytics/survey-docs"],
          summary: "Listar documentos de encuesta",
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Crear documento de encuesta",
          responses: { "201": { description: "Created" } },
        },
      },
      [`${basePath}/analytics/survey-device-targets`]: {
        get: {
          tags: ["analytics/survey-docs"],
          summary: "Listar targets de dispositivo",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-device-targets/deactivate`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Desactivar targets de dispositivo",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-admin/queue`]: {
        get: {
          tags: ["analytics/survey-docs"],
          summary: "Cola de encuestas admin",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-admin/production`]: {
        get: {
          tags: ["analytics/survey-docs"],
          summary: "Encuestas en produccion",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-device-activations`]: {
        get: {
          tags: ["analytics/survey-docs"],
          summary: "Listar activaciones de dispositivo",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-device-activations/{deviceUuid}/approve`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Aprobar activacion de dispositivo",
          parameters: [{ name: "deviceUuid", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-device-activations/{deviceUuid}/cancel`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Cancelar activacion de dispositivo",
          parameters: [{ name: "deviceUuid", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}`]: {
        get: {
          tags: ["analytics/survey-docs"],
          summary: "Detalle de documento de encuesta",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        put: {
          tags: ["analytics/survey-docs"],
          summary: "Actualizar documento de encuesta",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["analytics/survey-docs"],
          summary: "Eliminar documento de encuesta",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}/admin-transitions`]: {
        get: {
          tags: ["analytics/survey-docs"],
          summary: "Transiciones admin del doc de encuesta",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}/publish-web`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Publicar encuesta en web",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}/admin-transition`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Ejecutar transicion admin",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}/execute-device-deploy`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Desplegar encuesta en dispositivo",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}/execute-web-deploy`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Desplegar encuesta en web",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}/public-url`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Generar URL publica de encuesta",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}/load-collect`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Cargar modo coleccion",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-docs/{id}/assign-device`]: {
        post: {
          tags: ["analytics/survey-docs"],
          summary: "Asignar dispositivo a encuesta",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Analytics: Survey Reception ───────────────────────────────────────
      [`${basePath}/analytics/survey-reception/overview`]: {
        get: {
          tags: ["analytics/survey-reception"],
          summary: "Overview de recepcion de encuestas",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-reception/by-executable`]: {
        get: {
          tags: ["analytics/survey-reception"],
          summary: "Recepcion por ejecutable",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/analytics/survey-reception/executables/{id}/detail`]: {
        get: {
          tags: ["analytics/survey-reception"],
          summary: "Detalle de recepcion de ejecutable",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Collector Installer ───────────────────────────────────────────────
      [`${basePath}/collector/installer/info`]: {
        get: {
          tags: ["collector"],
          summary: "Info del instalador del colector",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${basePath}/collector/installer/versions`]: {
        get: {
          tags: ["collector"],
          summary: "Versiones del instalador del colector",
          responses: { "200": { description: "OK" } },
        },
      },

      // ── Survey Public Web ─────────────────────────────────────────────────
      "/s/{code}": {
        get: {
          tags: ["survey-public"],
          summary: "Encuesta por codigo corto",
          parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/encuestas/shorten": {
        get: {
          tags: ["survey-public"],
          summary: "Acortar URL de encuesta",
          responses: { "200": { description: "OK" } },
        },
      },
      "/encuestas/open/{executableCode}": {
        get: {
          tags: ["survey-public"],
          summary: "Abrir encuesta publica",
          parameters: [{ name: "executableCode", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/encuestas/open/{executableCode}/submit": {
        post: {
          tags: ["survey-public"],
          summary: "Enviar respuesta de encuesta publica",
          parameters: [{ name: "executableCode", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };
}