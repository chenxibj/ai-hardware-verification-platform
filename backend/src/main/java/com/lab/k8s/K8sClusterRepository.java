package com.lab.k8s;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface K8sClusterRepository extends JpaRepository<K8sCluster, Long> {
    Optional<K8sCluster> findByName(String name);
    List<K8sCluster> findByStatus(String status);
}
