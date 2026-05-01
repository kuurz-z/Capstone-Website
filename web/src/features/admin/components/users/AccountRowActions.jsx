function ActionButton({
  label,
  variant = "default",
  onPress,
  ariaLabel,
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`account-row-action account-row-action--${variant}`}
      aria-label={ariaLabel || label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onPress();
      }}
    >
      {label}
    </button>
  );
}

export default function AccountRowActions({
  canViewAccess,
  canManagePermissions,
  canEdit,
  canBlock,
  canUnblock,
  canArchive,
  canRestore,
  canHardDelete,
  onViewAccess,
  onManagePermissions,
  onEdit,
  onBlock,
  onUnblock,
  onArchive,
  onRestore,
  onHardDelete,
  disabled = false,
}) {
  return (
    <div className="account-row-actions" onClick={(event) => event.stopPropagation()}>
      {canViewAccess && (
        <ActionButton
          label="Access"
          variant="primary"
          onPress={onViewAccess}
          disabled={disabled}
        />
      )}
      {canManagePermissions && (
        <ActionButton
          label="Permissions"
          variant="primary"
          onPress={onManagePermissions}
          disabled={disabled}
        />
      )}
      {canEdit && <ActionButton label="Edit" onPress={onEdit} disabled={disabled} />}
      {canBlock && (
        <ActionButton
          label="Block"
          variant="warn"
          onPress={onBlock}
          disabled={disabled}
        />
      )}
      {canUnblock && (
        <ActionButton
          label="Unblock"
          variant="primary"
          onPress={onUnblock}
          disabled={disabled}
        />
      )}
      {canArchive && (
        <ActionButton
          label="Archive"
          variant="warn"
          onPress={onArchive}
          disabled={disabled}
        />
      )}
      {canRestore && (
        <ActionButton
          label="Restore"
          variant="primary"
          onPress={onRestore}
          disabled={disabled}
        />
      )}
      {canHardDelete && (
        <ActionButton
          label="Delete"
          variant="danger"
          ariaLabel="Permanently delete user"
          onPress={onHardDelete}
          disabled={disabled}
        />
      )}
    </div>
  );
}
