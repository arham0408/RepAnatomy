# GitHub reviewer-access check

Repository checked: **[cavemansatyn-design/RepAnatomy](.)**. Visibility: **private**. This is a point-in-time read-only check; repository access can change.

| Required reviewer | Confirmed current repository access | Pending invitation |
| --- | --- | --- |
| `knmeiss` | GitHub reports `none` | Not visible to the auditing account |
| `giolaq` | Confirmed collaborator, `write` permission | Already has access |
| `anishamalde` | GitHub reports `none` | Not visible to the auditing account |
| `mosesroth` | Confirmed collaborator, `write` permission | Already has access |
| `emersonsklar` | GitHub reports `none` | Not visible to the auditing account |
| `testing@devpost.com` | Not established by the available API access | Not visible to the auditing account |

The authenticated Git account has repository write access but no admin/maintainer permission. The collaborator list and individual permission endpoints were readable; listing pending repository invitations returned **HTTP 403**. Therefore `none` means no confirmed current access; it does not establish that an invitation was never sent.

## Owner verification

In GitHub **Settings → Collaborators / Manage access**, the repository owner should check all five usernames and the Devpost testing email. An invitation is distinct from accepted access; review its status and resend an expired invitation if appropriate. This audit did not send invitations, change permissions, or make the repository public.

The [official private-repository instructions](https://amazonappdev2026.devpost.com/details/faqs) name these reviewers. An MIT file does not make a private repository publicly readable or grant reviewer access by itself.
