"""Run the shared experimental replay with the dynamic-model adapter."""
import target_diverse_replay as runner
import target_dynamic_models as dynamic

if __name__ == '__main__':
    runner.diverse = dynamic
    runner.main()
