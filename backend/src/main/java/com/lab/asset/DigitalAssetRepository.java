package com.lab.asset;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface DigitalAssetRepository extends JpaRepository<DigitalAsset, Long> {
    Optional<DigitalAsset> findByAssetNo(String assetNo);
    List<DigitalAsset> findByAssetType(String assetType);
}
