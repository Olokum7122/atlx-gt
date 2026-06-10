export const INSTANCE_TYPE = Object.freeze({
  USER:    'user',
  SPONSOR: 'sponsor',
});

export const SCOPE_TYPE = Object.freeze({
  USER:    'user',
  SPONSOR: 'sponsor',
  ALL:     'all',
});

// ── Mappers ──────────────────────────────────────────────────────────────────
// Validan presencia de campos obligatorios; ?? null solo para opcionales.

export function mapInstance(row) {
  if (!row.instance_id) throw new Error('mapInstance: instance_id faltante');
  return {
    instance_id:       row.instance_id,
    cuenta_id:         row.cuenta_id,
    cuenta_user_name:  row.cuenta_user_name  ?? null,
    cuenta_email:      row.cuenta_email      ?? null,
    cuenta_display_name: row.cuenta_display_name ?? null,
    instance_type:     row.instance_type,
    tenant_id:         row.tenant_id         ?? null,
    root_location_id:  row.root_location_id  ?? null,
    status:            row.status,
    snapshot_hash:     row.snapshot_hash     ?? null,
    cascade_synced_at: row.cascade_synced_at ?? null,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
  };
}

export function mapDimensionLocation(row) {
  if (!row.location_id) throw new Error('mapDimensionLocation: location_id faltante');
  return {
    location_id:        row.location_id,
    instance_id:        row.instance_id,
    root_location_id:   row.root_location_id   ?? null,
    parent_location_id: row.parent_location_id ?? null,
    dimension_id:       row.dimension_id       ?? null,
    node_kind:          row.node_kind          ?? null,
    node_level:         row.node_level         ?? null,
    code:               row.code               ?? null,
    label:              row.label              ?? null,
    module_code:        row.module_code        ?? null,
    area_code:          row.area_code          ?? null,
    component_code:     row.component_code,
    visible:            row.visible,
    enabled:            row.enabled,
    meta_json:          row.meta_json          ?? null,
    sort_order:         row.sort_order,
    is_leaf:            row.is_leaf,
    materialized_at:    row.materialized_at,
    updated_at:         row.updated_at,
  };
}

export function mapSubDimensionLocation(row) {
  if (!row.id) throw new Error('mapSubDimensionLocation: id faltante');
  return {
    id:               row.id,
    instance_id:      row.instance_id,
    root_location_id: row.root_location_id ?? null,
    sub_dimension_id: row.sub_dimension_id,
    sub_code:         row.sub_code,
    sub_name:         row.sub_name         ?? null,
    sub_type:         row.sub_type         ?? null,
    visible:          row.visible,
    enabled:          row.enabled,
    sort_order:       row.sort_order,
    materialized_at:  row.materialized_at,
    updated_at:       row.updated_at,
  };
}

export function mapTemplateSummary(row) {
  if (!row.template_code) throw new Error('mapTemplateSummary: template_code faltante');
  return {
    template_code:        row.template_code,
    scope_type:           row.scope_type,
    dimension_node_count: row.dimension_node_count,
    sub_dimension_count:  row.sub_dimension_count,
    is_active_count:      row.is_active_count,
    updated_at:           row.updated_at ?? null,
  };
}

export function mapTemplateDimensionLocation(row) {
  if (!row.template_location_id) throw new Error('mapTemplateDimensionLocation: template_location_id faltante');
  return {
    template_location_id: row.template_location_id,
    template_code:        row.template_code,
    scope_type:           row.scope_type,
    dimension_id:         row.dimension_id,
    component_code:       row.component_code,
    dimension_code:       row.dimension_code  ?? null,
    dimension_name:       row.dimension_name  ?? null,
    dimension_type:       row.dimension_type  ?? null,
    applies_to:           row.applies_to      ?? null,
    visible:              row.visible,
    enabled:              row.enabled,
    sort_order:           row.sort_order,
    meta_json:            row.meta_json       ?? null,
    is_active:            row.is_active,
    updated_at:           row.updated_at,
  };
}

export function mapTemplateSubDimensionLocation(row) {
  if (!row.template_sub_location_id) throw new Error('mapTemplateSubDimensionLocation: template_sub_location_id faltante');
  return {
    template_sub_location_id: row.template_sub_location_id,
    template_code:            row.template_code,
    scope_type:               row.scope_type,
    sub_dimension_id:         row.sub_dimension_id,
    sub_code:                 row.sub_code        ?? null,
    sub_name:                 row.sub_name        ?? null,
    sub_type:                 row.sub_type        ?? null,
    parent_dimension_id:      row.parent_dimension_id ?? null,
    enabled:                  row.enabled,
    sort_order:               row.sort_order,
    meta_json:                row.meta_json       ?? null,
    is_active:                row.is_active,
    updated_at:               row.updated_at,
  };
}

export function mapCheckedDimensionLocation(row) {
  if (!row.template_location_id) throw new Error('mapCheckedDimensionLocation: template_location_id faltante');
  const scopeType = String(row.scope_type ?? '').trim().toLowerCase();
  const checked = row.is_checked == null ? null : row.is_checked === true || row.is_checked === 1;
  const sponsorVisible = row.visible_override == null
    ? (checked == null
      ? (row.template_visible === true || row.template_visible === 1)
      : checked)
    : (row.visible_override === true || row.visible_override === 1);
  const sponsorEnabled = row.enabled_override == null
    ? (checked == null
      ? (row.template_enabled === true || row.template_enabled === 1)
      : checked)
    : (row.enabled_override === true || row.enabled_override === 1);
  return {
    template_location_id: row.template_location_id,
    template_code:        row.template_code,
    scope_type:           row.scope_type,
    dimension_id:         row.dimension_id ?? null,
    dimension_code:       row.dimension_code ?? null,
    dimension_name:       row.dimension_name ?? null,
    dimension_type:       row.dimension_type ?? null,
    component_code:       row.component_code ?? null,
    sort_order:           row.sort_order ?? null,
    is_active:            row.is_active,
    control_mode:         row.control_mode ?? null,
    is_operable:          row.is_operable ?? null,
    template_visible:     row.template_visible,
    template_enabled:     row.template_enabled,
    visible_override:     row.visible_override ?? null,
    enabled_override:     row.enabled_override ?? null,
    is_checked:           row.is_checked ?? null,
    effective_visible:    scopeType === 'sponsor' ? sponsorVisible : row.effective_visible,
    effective_enabled:    scopeType === 'sponsor' ? sponsorEnabled : row.effective_enabled,
    effective_checked:    row.effective_checked,
    checked_updated_at:   row.checked_updated_at ?? null,
    template_updated_at:  row.template_updated_at ?? null,
  };
}

export function mapCheckedSubDimensionLocation(row) {
  if (!row.template_sub_location_id) throw new Error('mapCheckedSubDimensionLocation: template_sub_location_id faltante');
  const scopeType = String(row.scope_type ?? '').trim().toLowerCase();
  const checked = row.is_checked == null ? null : row.is_checked === true || row.is_checked === 1;
  const templateEnabled = row.template_enabled === true || row.template_enabled === 1;
  const sponsorVisible = row.visible_override == null
    ? (checked == null ? templateEnabled : checked)
    : (row.visible_override === true || row.visible_override === 1);
  const sponsorEnabled = row.enabled_override == null
    ? (checked == null ? templateEnabled : checked)
    : (row.enabled_override === true || row.enabled_override === 1);
  return {
    template_sub_location_id: row.template_sub_location_id,
    template_code:            row.template_code,
    scope_type:               row.scope_type,
    sub_dimension_id:         row.sub_dimension_id ?? null,
    sub_code:                 row.sub_code ?? null,
    sub_name:                 row.sub_name ?? null,
    sub_type:                 row.sub_type ?? null,
    sort_order:               row.sort_order ?? null,
    is_active:                row.is_active,
    control_mode:             row.control_mode ?? null,
    is_operable:              row.is_operable ?? null,
    template_enabled:         row.template_enabled,
    visible_override:         row.visible_override ?? null,
    enabled_override:         row.enabled_override ?? null,
    is_checked:               row.is_checked ?? null,
    effective_visible:        scopeType === 'sponsor' ? sponsorVisible : row.effective_visible,
    effective_enabled:        scopeType === 'sponsor' ? sponsorEnabled : row.effective_enabled,
    effective_checked:        row.effective_checked,
    checked_updated_at:       row.checked_updated_at ?? null,
    template_updated_at:      row.template_updated_at ?? null,
  };
}

export function mapCheckedReplaceResult(row) {
  if (!row?.instance_id) throw new Error('mapCheckedReplaceResult: instance_id faltante');
  return {
    instance_id:   row.instance_id,
    template_code: row.template_code ?? null,
    scope_type:    row.scope_type ?? null,
    inserted:      row.inserted ?? 0,
    updated:       row.updated ?? 0,
    deleted:       row.deleted ?? 0,
    replaced_at:   row.replaced_at ?? null,
  };
}
