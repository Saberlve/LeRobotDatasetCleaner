import wandb
import pandas as pd
import json
import os

def fetch_data():
    try:
        api = wandb.Api()
        project_path = "saberlve9-massachusetts-institute-of-technology/openpi"
        runs = api.runs(project_path)
        
        print(f"Found {len(runs)} runs")
        
        summary_list, config_list, name_list, id_list = [], [], [], []
        
        # Create directory for histories
        os.makedirs("eval_results/wandb_histories", exist_ok=True)
        
        for run in runs:
            # Summary and Config
            summary_list.append(run.summary._json_dict)
            config_list.append({k: v for k,v in run.config.items() if not k.startswith('_')})
            name_list.append(run.name)
            id_list.append(run.id)
            
            # Fetch history for curves (limiting samples to avoid massive files)
            # We want metrics like 'train/loss', 'eval/success_rate'
            print(f"Fetching history for {run.name} ({run.id})...")
            history = run.history(samples=500) # Get up to 500 points for smoothness
            if not history.empty:
                history.to_json(f"eval_results/wandb_histories/{run.id}.json", orient="records")

        runs_df = pd.DataFrame({
            "id": id_list,
            "name": name_list,
            "summary": summary_list,
            "config": config_list
        })
        
        runs_df.to_csv("eval_results/wandb_runs.csv", index=False)
        print("Exported summary to eval_results/wandb_runs.csv")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_data()
