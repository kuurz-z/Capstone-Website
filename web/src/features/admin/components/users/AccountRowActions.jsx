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
  canSuspend,
  canReactivate,
  canBan,
  canDelete,
  onEdit,
  onSuspend,
  onReactivate,
  onBan,
  onDelete,
}) {
  return (
    <div className="account-row-actions" onClick={(event) => event.stopPropagation()}>
      {canEdit && <ActionButton label="Edit" onPress={onEdit} />}
      {canSuspend && (
        <ActionButton
          label="Suspend"
          variant="warn"
          onPress={onSuspend}
        />
      )}
      {canReactivate && (
        <ActionButton
          label="Activate"
          variant="primary"
          onPress={onReactivate}
        />
      )}
      {canBan && (
        <ActionButton
          label="Ban"
          variant="warn"
          onPress={onBan}
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
    </div>
  );
}
