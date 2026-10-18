$ErrorActionPreference = 'Stop'

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TemporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("learn-phase1-" + [guid]::NewGuid().ToString('N'))

function Invoke-Check {
    param([string]$Command, [string[]]$Arguments)
    Write-Host "[check] $Command $($Arguments -join ' ')"
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "检查失败: $Command $($Arguments -join ' ')"
    }
}

$PythonCommand = if (Test-Path 'D:\software\anaconda3\python.exe') {
    'D:\software\anaconda3\python.exe'
} else {
    'python'
}
# The checks are read-only. Prevent imported Python modules from creating
# __pycache__ directories that would make the repository hygiene check fail.
$env:PYTHONDONTWRITEBYTECODE = '1'

Push-Location $RepositoryRoot
try {
    New-Item -ItemType Directory -Path @(
        (Join-Path $TemporaryRoot 'scripts'),
        (Join-Path $TemporaryRoot 'docs/phase0'),
        (Join-Path $TemporaryRoot 'data/remote_7500km')
    ) -Force | Out-Null

    # The build scripts are validated in an isolated copy because they write
    # reports by design. The repository's existing reports remain untouched.
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot 'scripts/build_first_wave_fuzzy_candidates.py') -Destination (Join-Path $TemporaryRoot 'scripts/build_first_wave_fuzzy_candidates.py')
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot 'scripts/check_first_wave_fuzzy_candidates.py') -Destination (Join-Path $TemporaryRoot 'scripts/check_first_wave_fuzzy_candidates.py')
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot 'scripts/build_exam_quality_review_queue.py') -Destination (Join-Path $TemporaryRoot 'scripts/build_exam_quality_review_queue.py')
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot 'scripts/check_exam_quality_review_queue.py') -Destination (Join-Path $TemporaryRoot 'scripts/check_exam_quality_review_queue.py')
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot 'docs/phase0/first-wave-mapping-review.json') -Destination (Join-Path $TemporaryRoot 'docs/phase0/first-wave-mapping-review.json')
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot 'docs/phase0/exam-selection-report.json') -Destination (Join-Path $TemporaryRoot 'docs/phase0/exam-selection-report.json')
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot 'data/remote_7500km/ey_data__x_7500km_russian_index_new_test.csv.gz') -Destination (Join-Path $TemporaryRoot 'data/remote_7500km/ey_data__x_7500km_russian_index_new_test.csv.gz')
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot 'data/remote_7500km/production_7500km_com__n_exam_question.csv.gz') -Destination (Join-Path $TemporaryRoot 'data/remote_7500km/production_7500km_com__n_exam_question.csv.gz')

    Write-Host '[check] node --check all Mini Program JavaScript files'
    $JavaScriptFiles = Get-ChildItem -Path (Join-Path $RepositoryRoot 'pages'), (Join-Path $RepositoryRoot 'services'), (Join-Path $RepositoryRoot 'utils'), (Join-Path $RepositoryRoot 'components') -Recurse -Filter '*.js' -File
    foreach ($JavaScriptFile in $JavaScriptFiles) {
        & node --check $JavaScriptFile.FullName
        if ($LASTEXITCODE -ne 0) {
            throw "JavaScript 语法检查失败: $($JavaScriptFile.FullName)"
        }
    }
    Write-Host "javascript syntax: PASS ($($JavaScriptFiles.Count) files)"

    Invoke-Check 'node' @('scripts/test_ui_contract.js')
    Invoke-Check 'node' @('scripts/test_dictionary_service.js')
Invoke-Check 'node' @('scripts/test_dictionary_api_mode.js')
Invoke-Check 'node' @('scripts/test_course_local_mode.js')
Invoke-Check 'node' @('scripts/test_course_content_api_mode.js')
Invoke-Check 'node' @('scripts/test_course_detail_states.js')
Invoke-Check 'node' @('scripts/test_course_word_dictionary_link.js')
Invoke-Check 'node' @('scripts/test_course_video_navigation.js')
Invoke-Check 'node' @('scripts/test_purchase_gate.js')
Invoke-Check 'node' @('scripts/test_dictionary.js')
Invoke-Check 'node' @('scripts/test_dictionary_search_states.js')
Invoke-Check 'node' @('scripts/test_dictionary_detail_lifecycle.js')
Invoke-Check 'node' @('scripts/test_dictionary_audio_visibility.js')
Invoke-Check 'node' @('scripts/test_word_audio_runtime.js')
Invoke-Check 'node' @('scripts/test_textbook_word_fallback.js')
Invoke-Check 'node' @('scripts/test_content_service.js')
Invoke-Check 'node' @('scripts/test_exam_service.js')
Invoke-Check 'node' @('scripts/test_exam_instruction_separation.js')
Invoke-Check 'node' @('scripts/test_exam_fallback_contract.js')
Invoke-Check 'node' @('scripts/test_exam_content_api_fallback.js')
Invoke-Check 'node' @('scripts/test_practice_source_state.js')
Invoke-Check 'node' @('scripts/test_runtime_samples.js')
Invoke-Check 'node' @('scripts/test_adapters.js')
Invoke-Check 'node' @('scripts/test_content_api_core.js')
Invoke-Check 'node' @('scripts/test_content_api_service.js')
Invoke-Check 'node' @('scripts/test_content_manifest.js')
Invoke-Check 'node' @('scripts/test_content_manifest_contract.js')
Invoke-Check 'node' @('scripts/test_request_guard.js')
Invoke-Check 'node' @('scripts/test_audio_service.js')
Invoke-Check 'node' @('scripts/test_media_player.js')
Invoke-Check 'node' @('scripts/test_playback_progress.js')
Invoke-Check 'node' @('scripts/test_resume_video_navigation.js')
Invoke-Check 'node' @('scripts/test_video_pause_progress.js')
Invoke-Check 'node' @('scripts/test_playback_service.js')
Invoke-Check 'node' @('scripts/test_video_write_guard.js')
Invoke-Check 'node' @('scripts/test_video_page_states.js')
Invoke-Check 'node' @('scripts/test_video_response_guard.js')
Invoke-Check 'node' @('scripts/test_video_switch_state.js')
Invoke-Check 'node' @('scripts/test_video_next_navigation.js')
Invoke-Check 'node' @('scripts/test_video_access_policy.js')
Invoke-Check 'node' @('scripts/test_readonly_user_pages.js')
Invoke-Check 'node' @('scripts/test_practice_storage_scope.js')
Invoke-Check 'node' @('scripts/test_practice_audio_state.js')
Invoke-Check 'node' @('scripts/test_practice_audio_icon.js')
Invoke-Check 'node' @('scripts/test_practice_audio_lifecycle.js')
Invoke-Check 'node' @('scripts/test_practice_load_states.js')
Invoke-Check 'node' @('scripts/test_exam_audio_status.js')
Invoke-Check 'node' @('scripts/test_exam_audio_resolver.js')
Invoke-Check 'node' @('scripts/test_exam_list_states.js')
Invoke-Check 'node' @('scripts/test_exam_list_pagination.js')
Invoke-Check 'node' @('scripts/test_exam_list_filter.js')
Invoke-Check 'node' @('scripts/test_index_network_states.js')
Invoke-Check 'node' @('scripts/test_practice_progress.js')
Invoke-Check $PythonCommand @('scripts/test_mapping_review_summary.py')
Invoke-Check $PythonCommand @('scripts/check_mapping_review.py')
Invoke-Check $PythonCommand @('scripts/check_first_wave_candidate_report.py')
    Invoke-Check $PythonCommand @((Join-Path $TemporaryRoot 'scripts/build_first_wave_fuzzy_candidates.py'))
    Invoke-Check $PythonCommand @((Join-Path $TemporaryRoot 'scripts/check_first_wave_fuzzy_candidates.py'))
Invoke-Check $PythonCommand @('scripts/check_first_wave_review_queue.py')
Invoke-Check 'node' @('scripts/test_mapping_runtime.js')
Invoke-Check $PythonCommand @('scripts/check_runtime_config.py')
Invoke-Check $PythonCommand @('scripts/check_write_guards.py')
Invoke-Check $PythonCommand @('scripts/test_runtime_config_security.py')
Invoke-Check $PythonCommand @('scripts/check_local_audio_policy.py')
Invoke-Check $PythonCommand @('scripts/test_local_audio_policy.py')
Invoke-Check $PythonCommand @('scripts/check_content_report_consistency.py')
    Invoke-Check $PythonCommand @((Join-Path $TemporaryRoot 'scripts/build_exam_quality_review_queue.py'))
    Invoke-Check $PythonCommand @((Join-Path $TemporaryRoot 'scripts/check_exam_quality_review_queue.py'))
Invoke-Check $PythonCommand @('scripts/test_exam_quality_rules.py')
Invoke-Check $PythonCommand @('scripts/test_exam_export_fields.py')
Invoke-Check $PythonCommand @('scripts/check_content_match_metrics.py')
Invoke-Check $PythonCommand @('scripts/check_app_config.py')
Invoke-Check $PythonCommand @('scripts/check_pack_options.py')
Invoke-Check $PythonCommand @('scripts/check_runtime_package.py')
Invoke-Check $PythonCommand @('scripts/check_miniprogram_routes.py')
Invoke-Check $PythonCommand @('scripts/check_miniprogram_assets.py')
Invoke-Check $PythonCommand @('scripts/check_wxml_directives.py')
Invoke-Check $PythonCommand @('scripts/check_wxml_conditionals.py')
Invoke-Check $PythonCommand @('scripts/test_media_server_logic.py')
Invoke-Check $PythonCommand @('scripts/test_cache_word_audio.py')
Invoke-Check $PythonCommand @('scripts/test_cache_exam_audio.py')
Invoke-Check $PythonCommand @('scripts/test_dictionary_search_ranking.py')
Invoke-Check $PythonCommand @('scripts/test_dictionary_index.py')
Invoke-Check $PythonCommand @('scripts/test_dictionary_store.py')
Invoke-Check $PythonCommand @('scripts/test_bench_dictionary_store.py')
Invoke-Check $PythonCommand @('scripts/test_content_api_sample_contract.py')
Invoke-Check $PythonCommand @('scripts/check_python_syntax.py')

    Write-Host 'phase1 checks: PASS' -ForegroundColor Green
}
finally {
    Pop-Location
    if (Test-Path -LiteralPath $TemporaryRoot) {
        Remove-Item -LiteralPath $TemporaryRoot -Recurse -Force
    }
}
