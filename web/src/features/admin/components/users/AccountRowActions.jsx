function ActionButton({
  label,
  variant = "default",
  onPress,
  ariaLabel,
}) {
  return (
    <button
      type="button"
      className={`account-row-action account-row-action--${variant}`}
      aria-label={ariaLabel || label}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
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
  canRestore,
  canDelete,
  canHardDelete,
  onViewAccess,
  onManagePermissions,
  onEdit,
  onBlock,
  onUnblock,
  onRestore,
  onDelete,
  onHardDelete,
}) {
  return (
    <div className="account-row-actions" onClick={(event) => event.stopPropagation()}>
      {canViewAccess && (
        <ActionButton
          label="Access"
          variant="primary"
          onPress={onViewAccess}
        />
      )}
      {canManagePermissions && (
        <ActionButton
          label="Permissions"
          variant="primary"
          onPress={onManagePermissions}
        />
      )}
      {canEdit && <ActionButton label="Edit" onPress={onEdit} />}
      {canBlock && (
        <ActionButton
          label="Block"
          variant="warn"
          onPress={onBlock}
        />
      )}
      {canUnblock && (
        <ActionButton
          label="Unblock"
          variant="primary"
          onPress={onUnblock}
        />
      )}
      {canRestore && (
        <ActionButton
          label="Restore"
          variant="primary"
          onPress={onRestore}
        />
      )}
      {canDelete && (
        <ActionButton
          label="Delete"
          variant="danger"
          ariaLabel="Delete user"
          onPress={onDelete}
        />
      )}
      {canHardDelete && (
        <ActionButton
          label="Delete (Hard)"
          variant="danger"
          ariaLabel="Hard Delete user"
          onPress={onHardDelete}
        />
      )}
    </div>
  );
}
