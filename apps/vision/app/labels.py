"""Label tables — the join key between the model and the API's foods seed.

`FOOD101_LABELS` is the id2label order of `onnx-community/swin-finetuned-food101-ONNX/config.json`
(index == class id, verified by tests/test_labels.py::test_food101_labels_match_the_downloaded_model_config).
Turkish names live here, not in the model, so adding a language is a column and not a retrain
(docs/research/food-recognition.md §6.2). Nutrition values live on the API side
(`apps/api/src/modules/nutrition/seed/foods.*.json`); every label here must exist there as an alias.
"""
from __future__ import annotations

FOOD101_LABELS: tuple[str, ...] = (
    "apple_pie", "baby_back_ribs", "baklava", "beef_carpaccio", "beef_tartare", "beet_salad", "beignets",
    "bibimbap", "bread_pudding", "breakfast_burrito", "bruschetta", "caesar_salad", "cannoli", "caprese_salad",
    "carrot_cake", "ceviche", "cheesecake", "cheese_plate", "chicken_curry", "chicken_quesadilla", "chicken_wings",
    "chocolate_cake", "chocolate_mousse", "churros", "clam_chowder", "club_sandwich", "crab_cakes", "creme_brulee",
    "croque_madame", "cup_cakes", "deviled_eggs", "donuts", "dumplings", "edamame", "eggs_benedict", "escargots",
    "falafel", "filet_mignon", "fish_and_chips", "foie_gras", "french_fries", "french_onion_soup", "french_toast",
    "fried_calamari", "fried_rice", "frozen_yogurt", "garlic_bread", "gnocchi", "greek_salad",
    "grilled_cheese_sandwich", "grilled_salmon", "guacamole", "gyoza", "hamburger", "hot_and_sour_soup", "hot_dog",
    "huevos_rancheros", "hummus", "ice_cream", "lasagna", "lobster_bisque", "lobster_roll_sandwich",
    "macaroni_and_cheese", "macarons", "miso_soup", "mussels", "nachos", "omelette", "onion_rings", "oysters",
    "pad_thai", "paella", "pancakes", "panna_cotta", "peking_duck", "pho", "pizza", "pork_chop", "poutine",
    "prime_rib", "pulled_pork_sandwich", "ramen", "ravioli", "red_velvet_cake", "risotto", "samosa", "sashimi",
    "scallops", "seaweed_salad", "shrimp_and_grits", "spaghetti_bolognese", "spaghetti_carbonara", "spring_rolls",
    "steak", "strawberry_shortcake", "sushi", "tacos", "takoyaki", "tiramisu", "tuna_tartare", "waffles",
)

TURKISH25_LABELS: tuple[str, ...] = (
    "asure", "baklava", "biber_dolmasi", "borek", "cig_kofte", "enginar", "et_sote", "gozleme", "hamsi",
    "hunkar_begendi", "icli_kofte", "ispanak", "izmir_kofte", "karniyarik", "kebap", "kisir", "kuru_fasulye",
    "lahmacun", "lokum", "manti", "mucver", "pirinc_pilavi", "simit", "taze_fasulye", "yaprak_sarma",
)
"""prithivMLmods/TurkishFoods-25 — optional second head (TURKISH_HEAD=1), unvetted (research §1.4)."""

MOCK_LABELS: tuple[str, ...] = (
    "pizza", "hamburger", "lahmacun", "menemen", "kofte", "pilav", "mercimek_corbasi", "salad", "omelette",
    "baklava", "sushi", "steak",
)
"""MUST mirror MOCK_LABELS in apps/api/src/modules/vision/client.ts — order is part of the contract
(the mock picks `MOCK_LABELS[hash_byte % len]`, so reordering changes every mock answer)."""

_FOOD101_TR: dict[str, str] = {
    "apple_pie": "Elmalı turta", "baby_back_ribs": "Barbekü kaburga", "baklava": "Baklava",
    "beef_carpaccio": "Dana karpaçyo", "beef_tartare": "Dana tartar", "beet_salad": "Pancar salatası",
    "beignets": "Fransız lokması", "bibimbap": "Bibimbap", "bread_pudding": "Ekmek pudingi",
    "breakfast_burrito": "Kahvaltı burritosu", "bruschetta": "Bruschetta", "caesar_salad": "Sezar salata",
    "cannoli": "Cannoli", "caprese_salad": "Caprese salata", "carrot_cake": "Havuçlu kek", "ceviche": "Ceviche",
    "cheesecake": "Cheesecake", "cheese_plate": "Peynir tabağı", "chicken_curry": "Köri soslu tavuk",
    "chicken_quesadilla": "Tavuklu quesadilla", "chicken_wings": "Tavuk kanat", "chocolate_cake": "Çikolatalı kek",
    "chocolate_mousse": "Çikolatalı mus", "churros": "Churros", "clam_chowder": "Deniz tarağı çorbası",
    "club_sandwich": "Klüp sandviç", "crab_cakes": "Yengeç köftesi", "creme_brulee": "Krem brüle",
    "croque_madame": "Croque madame", "cup_cakes": "Kapkek", "deviled_eggs": "Dolgulu yumurta", "donuts": "Donut",
    "dumplings": "Asya mantısı", "edamame": "Edamame", "eggs_benedict": "Benedict yumurta",
    "escargots": "Salyangoz", "falafel": "Falafel", "filet_mignon": "Bonfile",
    "fish_and_chips": "Balık ve patates kızartması", "foie_gras": "Kaz ciğeri",
    "french_fries": "Patates kızartması", "french_onion_soup": "Fransız soğan çorbası",
    "french_toast": "Fransız tostu", "fried_calamari": "Kalamar tava", "fried_rice": "Kızarmış pirinç",
    "frozen_yogurt": "Donmuş yoğurt", "garlic_bread": "Sarımsaklı ekmek", "gnocchi": "Gnocchi",
    "greek_salad": "Yunan salatası", "grilled_cheese_sandwich": "Kaşarlı tost", "grilled_salmon": "Izgara somon",
    "guacamole": "Guacamole", "gyoza": "Gyoza", "hamburger": "Hamburger", "hot_and_sour_soup": "Acı ekşi çorba",
    "hot_dog": "Sosisli sandviç", "huevos_rancheros": "Huevos rancheros", "hummus": "Humus",
    "ice_cream": "Dondurma", "lasagna": "Lazanya", "lobster_bisque": "Istakoz çorbası",
    "lobster_roll_sandwich": "Istakozlu sandviç", "macaroni_and_cheese": "Peynirli makarna",
    "macarons": "Makaron", "miso_soup": "Miso çorbası", "mussels": "Midye", "nachos": "Nachos",
    "omelette": "Omlet", "onion_rings": "Soğan halkası", "oysters": "İstiridye", "pad_thai": "Pad thai",
    "paella": "Paella", "pancakes": "Pankek", "panna_cotta": "Panna cotta", "peking_duck": "Pekin ördeği",
    "pho": "Pho", "pizza": "Pizza", "pork_chop": "Domuz pirzola", "poutine": "Poutine",
    "prime_rib": "Kaburga rosto", "pulled_pork_sandwich": "Didilmiş et sandviçi", "ramen": "Ramen",
    "ravioli": "Ravioli", "red_velvet_cake": "Red velvet kek", "risotto": "Risotto", "samosa": "Samosa",
    "sashimi": "Sashimi", "scallops": "Tarak midyesi", "seaweed_salad": "Deniz yosunu salatası",
    "shrimp_and_grits": "Karidesli mısır lapası", "spaghetti_bolognese": "Bolonez soslu spagetti",
    "spaghetti_carbonara": "Karbonara spagetti", "spring_rolls": "Bahar rulosu", "steak": "Biftek",
    "strawberry_shortcake": "Çilekli pasta", "sushi": "Suşi", "tacos": "Tako", "takoyaki": "Takoyaki",
    "tiramisu": "Tiramisu", "tuna_tartare": "Ton balığı tartarı", "waffles": "Waffle",
}

_TURKISH25_TR: dict[str, str] = {
    "asure": "Aşure", "baklava": "Baklava", "biber_dolmasi": "Biber dolması", "borek": "Börek",
    "cig_kofte": "Çiğ köfte", "enginar": "Enginar", "et_sote": "Et sote", "gozleme": "Gözleme", "hamsi": "Hamsi",
    "hunkar_begendi": "Hünkâr beğendi", "icli_kofte": "İçli köfte", "ispanak": "Ispanak",
    "izmir_kofte": "İzmir köfte", "karniyarik": "Karnıyarık", "kebap": "Kebap", "kisir": "Kısır",
    "kuru_fasulye": "Kuru fasulye", "lahmacun": "Lahmacun", "lokum": "Lokum", "manti": "Mantı",
    "mucver": "Mücver", "pirinc_pilavi": "Pirinç pilavı", "simit": "Simit", "taze_fasulye": "Taze fasulye",
    "yaprak_sarma": "Yaprak sarma",
}

_MOCK_TR: dict[str, str] = {
    "menemen": "Menemen", "kofte": "Köfte", "pilav": "Pilav", "mercimek_corbasi": "Mercimek çorbası",
    "salad": "Salata",
}

TR_NAMES: dict[str, str] = {**_FOOD101_TR, **_TURKISH25_TR, **_MOCK_TR}


def tr_name(label: str) -> str:
    """Turkish display name; unknown labels degrade to a readable form instead of raising."""
    known = TR_NAMES.get(label)
    if known:
        return known
    return label.replace("_", " ").capitalize()


# --------------------------------------------------------------------- CLIP gate prompts
CLIP_FOOD_PROMPTS: tuple[str, ...] = (
    "a photo of food",
    "a photo of a meal on a plate",
    "a close-up photo of a cooked dish",
    "a photo of a turkish dish",
)

CLIP_NONFOOD_PROMPTS: tuple[str, ...] = (
    "a photo of a person",
    "a photo of a pet",
    "a screenshot of a computer screen",
    "a photo of a document or text",
    "a photo of a car",
    "a photo of a landscape",
    "a photo of furniture in a room",
)
