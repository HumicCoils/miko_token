def main():
    API_KEY = "YOUR_BIRDEYE_API_KEY"
    finder = BirdeyeTokenFinder(API_KEY)
    
    # 특정 토큰 컨트랙트 주소 (예: POPCAT)
    contract_address = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"
    
    # 100달러로 구매 가능한 토큰 갯수 계산
    result = finder.calculate_token_amount_for_usd(contract_address, 100.0)
    
    # 결과 출력
    finder.display_token_purchase_info(result)
    
    # 다른 금액으로도 계산 가능
    result_500 = finder.calculate_token_amount_for_usd(contract_address, 500.0)
    finder.display_token_purchase_info(result_500)

if __name__ == "__main__":
    main()

