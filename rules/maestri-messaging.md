# Maestri messaging

Applies only when exchanging messages with another agent through Maestri: `maestri ask` (with or without `--batch`) or
an incoming message starting with `~` followed by a space. Does not apply to `maestri ask --raw`, which sends keys,
not messages.

- Before sending or replying, load the `maestri-protocol` skill and follow it. If unavailable, tell the user instead
  of proceeding without it.
- Every reply to an agent starts with `~ <Your name> | <STATUS> | <ref> | <one-line summary>`. Your name is what appears
  under `You:` in `maestri list`.
