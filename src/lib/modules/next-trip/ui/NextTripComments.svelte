<script lang="ts">
	import { Edit3, MessageCircle, Send, Trash2 } from '@lucide/svelte';

	import type { NextTripComment } from '../domain/next-trip';
	import LinkedText from './LinkedText.svelte';

	let {
		comments,
		canComment,
		online,
		onadd,
		onupdate,
		ondelete
	}: {
		comments: NextTripComment[];
		canComment: boolean;
		online: boolean;
		onadd: (body: string) => Promise<void>;
		onupdate: (commentId: string, body: string) => Promise<void>;
		ondelete: (commentId: string) => Promise<void>;
	} = $props();

	let expanded = $state(false);
	let draft = $state('');
	let editingId = $state<string>();
	let editingBody = $state('');
	let saving = $state(false);

	async function add(): Promise<void> {
		if (!draft.trim() || saving) return;
		saving = true;
		try {
			await onadd(draft);
			draft = '';
		} finally {
			saving = false;
		}
	}

	function startEditing(comment: NextTripComment): void {
		editingId = comment.id;
		editingBody = comment.body;
	}

	async function update(): Promise<void> {
		if (!editingId || !editingBody.trim() || saving) return;
		saving = true;
		try {
			await onupdate(editingId, editingBody);
			editingId = undefined;
			editingBody = '';
		} finally {
			saving = false;
		}
	}

	async function remove(comment: NextTripComment): Promise<void> {
		if (!window.confirm(`Slette kommentaren fra ${comment.personName}?`)) return;
		saving = true;
		try {
			await ondelete(comment.id);
		} finally {
			saving = false;
		}
	}
</script>

<div class="border-t border-base-300 pt-3">
	<button
		class="btn h-9 min-h-9 btn-ghost px-2 btn-sm"
		type="button"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		<MessageCircle size={17} aria-hidden="true" />
		{comments.length}
		{comments.length === 1 ? 'kommentar' : 'kommentarer'}
	</button>

	{#if expanded}
		<div class="mt-3 space-y-3">
			{#each comments as comment (comment.id)}
				<div class="border-l-2 border-base-300 pl-3">
					{#if editingId === comment.id}
						<textarea
							class="textarea-bordered textarea min-h-20 w-full"
							bind:value={editingBody}
							maxlength="2000"
							aria-label={`Rediger kommentar fra ${comment.personName}`}></textarea>
						<div class="mt-2 flex justify-end gap-2">
							<button
								class="btn btn-ghost btn-sm"
								type="button"
								disabled={saving || !online}
								onclick={() => (editingId = undefined)}>Avbryt</button
							>
							<button
								class="btn btn-primary btn-sm"
								type="button"
								disabled={saving || !online || !editingBody.trim()}
								onclick={update}>Lagre</button
							>
						</div>
					{:else}
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-sm"><LinkedText text={comment.body} /></p>
								<p class="mt-1 text-xs text-base-content/55">
									{comment.personName} ·
									<time datetime={comment.createdAt}>{comment.createdAt.slice(0, 10)}</time>
									{#if comment.updatedAt !== comment.createdAt}
										· Redigert{/if}
								</p>
							</div>
							<div class="flex shrink-0">
								<button
									class="btn btn-square btn-ghost btn-sm"
									type="button"
									disabled={saving || !online}
									aria-label={`Rediger kommentar fra ${comment.personName}`}
									onclick={() => startEditing(comment)}
								>
									<Edit3 size={16} aria-hidden="true" />
								</button>
								<button
									class="btn btn-square btn-ghost text-error btn-sm"
									type="button"
									disabled={saving || !online}
									aria-label={`Slett kommentar fra ${comment.personName}`}
									onclick={() => remove(comment)}
								>
									<Trash2 size={16} aria-hidden="true" />
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}

			{#if canComment}
				<form
					class="flex items-end gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						void add();
					}}
				>
					<label class="min-w-0 flex-1">
						<span class="sr-only">Ny kommentar</span>
						<textarea
							class="textarea-bordered textarea min-h-12 w-full"
							bind:value={draft}
							maxlength="2000"
							placeholder="Skriv en kommentar"
							disabled={!online}></textarea>
					</label>
					<button
						class="btn btn-square btn-primary"
						type="submit"
						disabled={saving || !online || !draft.trim()}
						aria-label="Legg til kommentar"
					>
						<Send size={18} aria-hidden="true" />
					</button>
				</form>
			{/if}
		</div>
	{/if}
</div>
