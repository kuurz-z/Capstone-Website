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
  canEdit,
  canBlock,
  canUnblock,
  canRestore,
  canHardDelete,
  onEdit,
  onBlock,
  onUnblock,
  onRestore,
  onHardDelete,
}) {
  return (
    <div className="account-row-actions" onClick={(event) => event.stopPropagation()}>
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
      {canHardDelete && (
        <ActionButton
          label="Delete"
          variant="danger"
          ariaLabel="Hard Delete user"
          onPress={onHardDelete}
        />
      )}
    </div>
  );
}
