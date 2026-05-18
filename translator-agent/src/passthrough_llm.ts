import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';

/**
 * Deterministic passthrough LLM slot: the pipeline still expects an LLM step before TTS, but spoken output is
 * owned by {@link VoisaInterpretationCoordinator} (`session.say` on partial/final `voisa.transcript`) so we do
 * not replay the full line at end-of-turn.
 */
export class PassthroughTranslationLLM extends llm.LLM {
  label(): string {
    return 'passthrough.translation';
  }

  override get model(): string {
    return 'passthrough';
  }

  override get provider(): string {
    return 'voisa';
  }

  chat(opts: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    return new PassthroughTranslationLLMStream(this, {
      ...opts,
      connOptions: opts.connOptions ?? DEFAULT_API_CONNECT_OPTIONS,
    });
  }
}

class PassthroughTranslationLLMStream extends llm.LLMStream {
  constructor(llmInst: PassthroughTranslationLLM, opts: ConstructorParameters<typeof llm.LLMStream>[1]) {
    super(llmInst, opts);
  }

  async run(): Promise<void> {
    /**
     * {@link VoisaInterpretationCoordinator} drives `session.say` from streaming `voisa.transcript`.
     * Emitting the same line here would replay the translation at end-of-turn (duplicate audio).
     * Close immediately so no empty `pipelineReply` / preemptive TTS competes with `allowInterruptions: false` speech.
     */
    this.queue.close();
  }
}
